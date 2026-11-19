const fs = require('node:fs/promises');
const { chromium } = require('playwright-core');

function replaceSection(source, name, content) {
  const start = '<!-- ' + name + ':start -->';
  const end = '<!-- ' + name + ':end -->';
  const first = source.indexOf(start);
  const last = source.indexOf(end);
  if (first < 0 || last < first || first !== source.lastIndexOf(start) || last !== source.lastIndexOf(end)) {
    throw new Error('Expected one pair of ' + name + ' markers');
  }
  const indent = source.slice(source.lastIndexOf('\n', last) + 1, last);
  return source.slice(0, first + start.length) + '\n' + content + '\n' + indent + source.slice(last);
}

async function refresh() {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
      colorScheme: 'light',
      reducedMotion: 'reduce',
      timezoneId: 'UTC',
      locale: 'en-US'
    });
    // Keep the demos' sample dates consistent between screenshots.
    await page.clock.setFixedTime(new Date('2026-11-18T12:00:00Z'));
    const response = await page.goto(process.env.PORTFOLIO_URL || 'http://127.0.0.1:8000/');
    if (!response.ok()) throw new Error('Could not load the portfolio: ' + response.status());
    await page.waitForSelector('#more-repos[data-refreshed="true"]', { state: 'attached' });
    await page.evaluate(() => document.fonts.ready);

    const introduction = await page.locator('.intro-body p').innerText();
    const projects = await page.locator('article.project').evaluateAll(cards => cards.map(card => {
      const name = card.querySelector('h3').textContent.trim();
      const url = card.querySelector('.more a').href;
      const kind = card.querySelector('.kind').textContent.trim();
      const stack = card.querySelector('.stack').textContent.trim();
      return '- [' + name + '](' + url + ') — ' + kind + '. Built with ' + stack + '.';
    }));
    const repositories = await page.locator('#more-repos').evaluate(box => {
      const copy = box.cloneNode(true);
      delete copy.dataset.refreshed;
      return '      ' + copy.outerHTML;
    });
    const section = [
      introduction, '', '![Desktop screenshot of the portfolio](docs/portfolio.png)',
      '', '## Featured projects', '', ...projects
    ].join('\n');
    const html = await fs.readFile('index.html', 'utf8');
    const readme = await fs.readFile('README.md', 'utf8');
    const updatedHtml = replaceSection(html, 'public-repos', repositories);
    const updatedReadme = replaceSection(readme, 'portfolio', '\n' + section + '\n');

    await fs.mkdir('docs', { recursive: true });
    await page.screenshot({ path: 'docs/portfolio.png', animations: 'disabled' });
    if (updatedHtml !== html) await fs.writeFile('index.html', updatedHtml);
    if (updatedReadme !== readme) await fs.writeFile('README.md', updatedReadme);
    console.log('Refreshed the site, screenshot and README for ' + projects.length + ' featured projects.');
  } finally {
    await browser.close();
  }
}

refresh().catch(error => { console.error(error); process.exitCode = 1; });
