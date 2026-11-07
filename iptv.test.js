const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MODULE_PATH = path.join(__dirname, 'iptv.js');
const DEFAULT_M3U_URL = 'http://10.0.0.254/IPTV.m3u';
const CCTV_LOGO = 'https://live.fanmingming.com/tv/CCTV1.png';
const RADIO_LOGO = 'https://live.fanmingming.com/radio/中国之声.png';
const GROUP_CCTV_ICON_URL = 'https://raw.githubusercontent.com/Hamster-Prime/rex-iptv-widget/main/icons/cctv.png';
const GROUP_RADIO_ICON_URL = 'https://raw.githubusercontent.com/Hamster-Prime/rex-iptv-widget/main/icons/radio.png';
const GROUP_SATELLITE_ICON_URL = 'https://raw.githubusercontent.com/Hamster-Prime/rex-iptv-widget/main/icons/satellite.png';
const GROUP_FEATURED_ICON_URL = 'https://raw.githubusercontent.com/Hamster-Prime/rex-iptv-widget/main/icons/featured.png';

const SAMPLE_M3U = `#EXTM3U x-tvg-url="https://example.com/epg.xml"
#EXTINF:-1 tvg-id="cctv1" tvg-name="CCTV, One" tvg-logo="${CCTV_LOGO}" group-title="央视频道",CCTV-1 综合
http://172.31.0.2:7088/rtp/226.0.2.153:9136
#EXTINF:-1 tvg-id="radio" tvg-name="Radio" tvg-logo="https://example.com/radio.png" group-title="广播电台",中国之声
http://ngcdn001.cnr.cn/live/zgzs/index.m3u8
`;

function loadModule(m3u = SAMPLE_M3U) {
  const code = fs.readFileSync(MODULE_PATH, 'utf8');
  const requests = [];
  const context = {
    console,
    Widget: {
      http: {
        get: async (url) => {
          requests.push(url);
          return { data: typeof m3u === 'function' ? m3u(url) : m3u };
        },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: MODULE_PATH });
  return { context, requests };
}

function expectedCompositeLogoUrl(source, width, height, logoWidth, logoHeight, background = '00000000') {
  const overlay = encodeURIComponent(
    Buffer.from(encodeURIComponent(source), 'ascii').toString('base64'),
  );
  return 'https://ik.imagekit.io/huangxd/tr:l-image,i-transparent.png,' +
    `w-${width},h-${height},bg-${background},lfo-center,l-image,ie-${overlay},` +
    `w-${logoWidth},h-${logoHeight},cm-pad_resize,bg-${background},` +
    'lfo-center,l-end,l-end/transparent.png';
}

test('parseM3U extracts stream metadata and preserves commas in titles', () => {
  const { context } = loadModule();
  const channels = context.parseM3U(SAMPLE_M3U);

  assert.equal(channels.length, 2);
  assert.equal(channels[0].id, 'cctv1');
  assert.equal(channels[0].name, 'CCTV-1 综合');
  assert.equal(channels[0].tvgName, 'CCTV, One');
  assert.equal(channels[0].logo, CCTV_LOGO);
  assert.equal(channels[0].group, '央视频道');
  assert.equal(channels[0].url, 'http://172.31.0.2:7088/rtp/226.0.2.153:9136');
  assert.equal(channels[1].name, '中国之声');
});

test('parseM3U keeps only the first entry for a duplicate stream URL', () => {
  const { context } = loadModule();
  const duplicate = '#EXTINF:-1 tvg-id="duplicate",重复频道\nhttp://172.31.0.2:7088/rtp/226.0.2.153:9136\n';
  const channels = context.parseM3U(SAMPLE_M3U + duplicate);

  assert.equal(channels.length, 2);
  assert.equal(channels[0].name, 'CCTV-1 综合');
});

test('composite logo URLs use bounded remote layers for TV and radio artwork', () => {
  const { context } = loadModule();
  const expectedOverlay = encodeURIComponent(
    Buffer.from(encodeURIComponent(RADIO_LOGO), 'ascii').toString('base64'),
  );

  assert.equal(context.encodeImageKitOverlay(RADIO_LOGO), expectedOverlay);
  for (const source of [CCTV_LOGO, RADIO_LOGO]) {
    assert.equal(
      context.normalizePosterUrl(source),
      expectedCompositeLogoUrl(source, 800, 1200, 640, 900),
    );
    assert.equal(
      context.normalizeBackdropUrl(source),
      expectedCompositeLogoUrl(source, 1200, 500, 800, 400),
    );
  }
  assert.equal(context.normalizePosterUrl(''), '');
  assert.equal(context.normalizeBackdropUrl(''), '');
});

test('loadList returns large category cards instead of individual channels', async () => {
  const { context, requests } = loadModule();
  const items = await context.loadList({ count: 100 });

  assert.deepEqual(requests, [DEFAULT_M3U_URL]);
  assert.equal(items.length, 2);
  assert.deepEqual(Array.from(items, (item) => item.title), ['央视频道', '广播频道']);

  const item = items[0];
  assert.equal(item.id, 'iptv-group:央视频道');
  assert.equal(item.link, 'iptv-group:央视频道');
  assert.equal(item.type, 'url');
  assert.equal(item.mediaType, undefined);
  assert.equal(item.coverUrl, expectedCompositeLogoUrl(GROUP_CCTV_ICON_URL, 800, 1200, 640, 900, 'FFFFFF'));
  assert.equal(item.posterPath, item.coverUrl);
  assert.equal(item.backdropPath, expectedCompositeLogoUrl(GROUP_CCTV_ICON_URL, 1200, 500, 800, 400, 'FFFFFF'));
  assert.equal(items[1].coverUrl, expectedCompositeLogoUrl(GROUP_RADIO_ICON_URL, 800, 1200, 640, 900, 'FFFFFF'));
  assert.equal(items[1].backdropPath, expectedCompositeLogoUrl(GROUP_RADIO_ICON_URL, 1200, 500, 800, 400, 'FFFFFF'));
  assert.equal(item.videoUrl, undefined);
  assert.equal(item.genreItems, undefined);
  assert.equal(item.episodeItems, undefined);
  assert.equal(item.playerType, 'app');
  assert.equal(item.genreTitle, '央视频道');
});

test('module removes the top-right enumeration and keeps the beta tag', () => {
  const { context } = loadModule();
  const modules = context.WidgetMetadata.modules;

  assert.equal(modules.length, 1);
  assert.equal(modules[0].title, 'IPTV');
  assert.equal(modules[0].functionName, 'loadList');
  assert.equal(modules[0].sectionMode, undefined);
  assert.equal(modules[0].cacheDuration, 300);
  assert.equal(context.WidgetMetadata.detailCacheDuration, 300);
  assert.equal(context.WidgetMetadata.version, '1.4.0');
  assert.equal(modules[0].params.some((param) => param.name === 'group'), false);
  assert.equal(modules[0].params[0].value, DEFAULT_M3U_URL);
});

test('loadDetail turns a category into a flat channel playlist', async () => {
  const m3u = `#EXTM3U
#EXTINF:-1 tvg-id="cctv1" group-title="央视频道",CCTV-1
http://example.com/cctv1.ts
#EXTINF:-1 tvg-id="cctv2" group-title="央视频道",CCTV-2
http://example.com/cctv2.ts
#EXTINF:-1 tvg-id="radio" group-title="广播电台",中国之声
http://example.com/radio.m3u8
`;
  const { context } = loadModule(m3u);
  const listItems = await context.loadList({ count: 100 });
  assert.deepEqual(Array.from(listItems, (item) => item.title), ['央视频道', '广播频道']);
  assert.ok(listItems.every((item) => item.link && !item.videoUrl && !item.episodeItems));

  const detail = await context.loadDetail('iptv-group:央视频道');
  assert.equal(detail.title, '央视频道');
  assert.equal(detail.link, 'iptv-group:央视频道');
  assert.equal(detail.coverUrl, listItems[0].coverUrl);
  assert.equal(detail.backdropPath, listItems[0].backdropPath);
  assert.equal(detail.videoUrl, 'http://example.com/cctv1.ts');
  assert.equal(detail.episode, 1);
  assert.equal(detail.mediaType, undefined);
  assert.equal(detail.episodeItems.length, 2);
  assert.deepEqual(Array.from(detail.episodeItems, (item) => item.title), ['CCTV-1', 'CCTV-2']);
  assert.deepEqual(Array.from(detail.episodeItems, (item) => item.episode), [1, 2]);
  assert.ok(detail.episodeItems.every((item) => item.videoUrl));
  assert.ok(detail.episodeItems.every((item) => item.genreTitle === '央视频道'));
  assert.ok(detail.episodeItems.every((item) => item.episodeItems === undefined));
  assert.ok(detail.episodeItems.every((item) => item.mediaType === undefined));
  assert.doesNotThrow(() => JSON.stringify(detail));

  const channelDetail = await context.loadDetail('http://example.com/cctv2.ts');
  assert.equal(channelDetail.title, 'CCTV-2');
  assert.equal(channelDetail.episode, 2);
  assert.equal(channelDetail.episodeItems.length, 2);

  assert.equal(await context.loadDetail('iptv-group:不存在'), null);
  assert.equal(await context.loadDetail('http://example.com/unknown.ts'), null);
});

test('search still routes individual channels through loadDetail', async () => {
  const { context } = loadModule();

  const byTvgName = await context.search({ keyword: 'radio' });
  assert.equal(byTvgName.length, 1);
  assert.equal(byTvgName[0].title, '中国之声');

  const byGroup = await context.search({ query: '央视' });
  assert.equal(byGroup.length, 1);
  assert.equal(byGroup[0].title, 'CCTV-1 综合');
  assert.equal(byGroup[0].videoUrl, undefined);
  assert.equal(byGroup[0].link, 'http://172.31.0.2:7088/rtp/226.0.2.153:9136');
  assert.equal(byGroup[0].episodeItems, undefined);
  assert.equal(context.WidgetMetadata.search.functionName, 'search');
});

const liveTest = process.env.RUN_LIVE_TEST === '1' ? test : test.skip;

liveTest('real M3U exposes four category cards with the correct episode lists', { timeout: 30000 }, async () => {
  const response = await fetch(DEFAULT_M3U_URL, { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200);
  const body = await response.text();
  const { context } = loadModule(body);

  assert.equal(context.WidgetMetadata.modules.length, 1);
  assert.equal(context.WidgetMetadata.modules[0].sectionMode, undefined);
  assert.equal(context.WidgetMetadata.modules[0].cacheDuration, 300);
  assert.equal(context.WidgetMetadata.modules[0].params.some((param) => param.name === 'group'), false);

  const allItems = await context.loadList({ count: 100 });
  assert.equal(allItems.length, 4);
  assert.equal(new Set(allItems.map((item) => item.link)).size, 4);
  assert.deepEqual(
    Array.from(allItems, (item) => item.title),
    ['央视频道', '卫视频道', '央视精选', '广播频道'],
  );
  assert.ok(allItems.every((item) => item.title && item.coverUrl && item.link));
  assert.ok(allItems.every((item) => item.videoUrl === undefined));
  assert.ok(allItems.every((item) => item.episodeItems === undefined));
  assert.ok(allItems.every((item) => item.link.startsWith('iptv-group:')));
  assert.ok(allItems.every((item) => item.id === item.link));
  assert.ok(allItems.every((item) => item.mediaType === undefined));
  assert.ok(allItems.every((item) => item.genreItems === undefined));
  assert.ok(allItems.every((item) => item.playerType === 'app'));
  assert.ok(allItems.every((item) => item.coverUrl.startsWith('https://ik.imagekit.io/huangxd/tr:')));
  assert.ok(allItems.every((item) => item.coverUrl.includes('w-800,h-1200,bg-FFFFFF')));
  assert.ok(allItems.every((item) => item.posterPath === item.coverUrl));
  assert.ok(allItems.every((item) => item.backdropPath.includes('w-1200,h-500,bg-FFFFFF')));

  const expectedGroupArtwork = {
    央视频道: [
      expectedCompositeLogoUrl(GROUP_CCTV_ICON_URL, 800, 1200, 640, 900, 'FFFFFF'),
      expectedCompositeLogoUrl(GROUP_CCTV_ICON_URL, 1200, 500, 800, 400, 'FFFFFF'),
    ],
    卫视频道: [
      expectedCompositeLogoUrl(GROUP_SATELLITE_ICON_URL, 800, 1200, 640, 900, 'FFFFFF'),
      expectedCompositeLogoUrl(GROUP_SATELLITE_ICON_URL, 1200, 500, 800, 400, 'FFFFFF'),
    ],
    央视精选: [
      expectedCompositeLogoUrl(GROUP_FEATURED_ICON_URL, 800, 1200, 640, 900, 'FFFFFF'),
      expectedCompositeLogoUrl(GROUP_FEATURED_ICON_URL, 1200, 500, 800, 400, 'FFFFFF'),
    ],
    广播频道: [
      expectedCompositeLogoUrl(GROUP_RADIO_ICON_URL, 800, 1200, 640, 900, 'FFFFFF'),
      expectedCompositeLogoUrl(GROUP_RADIO_ICON_URL, 1200, 500, 800, 400, 'FFFFFF'),
    ],
  };
  for (const card of allItems) {
    assert.equal(card.coverUrl, expectedGroupArtwork[card.title][0]);
    assert.equal(card.backdropPath, expectedGroupArtwork[card.title][1]);
  }

  const expectedCounts = {
    央视频道: 18,
    卫视频道: 28,
    央视精选: 12,
    广播频道: 20,
  };
  const actualCounts = {};
  for (const card of allItems) {
    const detail = await context.loadDetail(card.link);
    actualCounts[card.title] = detail.episodeItems.length;
    assert.equal(detail.title, card.title);
    assert.equal(detail.coverUrl, card.coverUrl);
    assert.equal(detail.backdropPath, card.backdropPath);
    assert.ok(detail.videoUrl);
    assert.equal(detail.mediaType, undefined);
    assert.ok(detail.episodeItems.every((entry) => entry.videoUrl));
    assert.ok(detail.episodeItems.every((entry) => entry.genreTitle === card.title));
    assert.ok(detail.episodeItems.every((entry) => entry.episodeItems === undefined));
    assert.ok(detail.episodeItems.every((entry) => entry.backdropPath.includes('w-800,h-400,cm-pad_resize')));
  }
  assert.deepEqual(actualCounts, expectedCounts);

  console.log('Live M3U verification:', {
    importedGroups: allItems.length,
    importedChannels: Object.values(actualCounts).reduce((sum, count) => sum + count, 0),
    categoryCounts: actualCounts,
    categoryPicker: 'group-cards',
    detailWorkflow: true,
  });
});
