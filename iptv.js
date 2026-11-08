var DEFAULT_M3U_URL = 'http://10.0.0.254/IPTV.m3u';
var GROUP_DEFINITIONS = [
  {
    value: '央视频道',
    title: '央视频道',
    iconUrl: 'https://raw.githubusercontent.com/Hamster-Prime/rex-iptv-widget/main/icons/cctv.png?v=6',
  },
  {
    value: '卫视频道',
    title: '卫视频道',
    iconUrl: 'https://raw.githubusercontent.com/Hamster-Prime/rex-iptv-widget/main/icons/satellite.png?v=6',
  },
  {
    value: '央视精选',
    title: '央视精选',
    iconUrl: 'https://raw.githubusercontent.com/Hamster-Prime/rex-iptv-widget/main/icons/featured.png?v=6',
  },
  {
    value: '广播电台',
    title: '广播频道',
    iconUrl: 'https://raw.githubusercontent.com/Hamster-Prime/rex-iptv-widget/main/icons/radio.png?v=6',
  },
];

function getGroupDefinition(value) {
  for (var i = 0; i < GROUP_DEFINITIONS.length; i += 1) {
    if (GROUP_DEFINITIONS[i].value === value) return GROUP_DEFINITIONS[i];
  }
  return null;
}

function getGroupTitle(value) {
  var definition = getGroupDefinition(value);
  return definition ? definition.title : value;
}

function createIptvModule() {
  return {
    id: 'iptv',
    title: 'IPTV',
    description: '按 M3U 分组浏览，通过详情选集播放 IPTV 频道',
    functionName: 'loadList',
    cacheDuration: 300,
    params: [
      { name: 'source', title: 'M3U 地址', type: 'constant', value: DEFAULT_M3U_URL },
    ],
  };
}

var WidgetMetadata = {
  id: 'rex.iptv.local',
  title: 'IPTV 直播',
  description: '读取 M3U 播放列表，按分组浏览并通过详情选集播放 IPTV 频道',
  author: 'Sanite',
  version: '1.4.4',
  requiredVersion: '0.0.1',
  detailCacheDuration: 300,
  modules: [createIptvModule()],
  search: {
    title: '搜索 IPTV 频道',
    functionName: 'search',
    params: [
      { name: 'keyword', title: '频道名称或分组', type: 'input' },
      { name: 'source', title: 'M3U 地址', type: 'constant', value: DEFAULT_M3U_URL },
    ],
  },
};

function findExtinfSeparator(line) {
  var quoted = false;
  for (var i = 8; i < line.length; i += 1) {
    var char = line[i];
    if (char === '"') quoted = !quoted;
    if (char === ',' && !quoted) return i;
  }
  return -1;
}

function parseExtinf(line) {
  var separator = findExtinfSeparator(line);
  if (separator < 0) return null;

  var attributes = {};
  var attributePattern = /([\w-]+)="([^"]*)"/g;
  var match;
  var metadata = line.slice(8, separator);
  while ((match = attributePattern.exec(metadata)) !== null) {
    attributes[match[1]] = match[2];
  }

  return {
    attributes: attributes,
    name: line.slice(separator + 1).trim(),
  };
}

function parseM3U(text) {
  var channels = [];
  var seenUrls = Object.create(null);
  var current = null;
  var lines = String(text || '').split(/\r?\n/);

  for (var i = 0; i < lines.length; i += 1) {
    var line = lines[i].trim();
    if (!line) continue;

    if (line.indexOf('#EXTINF:') === 0) {
      current = parseExtinf(line);
      if (current) current.headers = {};
      continue;
    }

    if (!current) continue;

    if (line.indexOf('#EXTVLCOPT:http-user-agent=') === 0) {
      current.headers['User-Agent'] = line.slice(27).trim();
      continue;
    }
    if (line.indexOf('#EXTVLCOPT:http-referrer=') === 0) {
      current.headers.Referer = line.slice(25).trim();
      continue;
    }
    if (line[0] === '#') continue;
    if (!/^https?:\/\//i.test(line)) continue;
    if (seenUrls[line]) {
      current = null;
      continue;
    }
    seenUrls[line] = true;

    var attributes = current.attributes;
    channels.push({
      id: attributes['tvg-id'] || line,
      name: current.name || attributes['tvg-name'] || '未命名频道',
      tvgName: attributes['tvg-name'] || '',
      logo: attributes['tvg-logo'] || '',
      group: attributes['group-title'] || '未分组',
      url: line,
      headers: current.headers,
    });
    current = null;
  }

  return channels;
}

async function fetchChannels(params) {
  var source = (params && params.source) || DEFAULT_M3U_URL;
  var response = await Widget.http.get(source);
  return parseM3U(response.data);
}

function encodeBase64Ascii(text) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var output = '';
  for (var i = 0; i < text.length; i += 3) {
    var first = text.charCodeAt(i);
    var second = i + 1 < text.length ? text.charCodeAt(i + 1) : NaN;
    var third = i + 2 < text.length ? text.charCodeAt(i + 2) : NaN;
    var combined = (first << 16) | ((isNaN(second) ? 0 : second) << 8) | (isNaN(third) ? 0 : third);
    output += chars.charAt((combined >> 18) & 63);
    output += chars.charAt((combined >> 12) & 63);
    output += isNaN(second) ? '=' : chars.charAt((combined >> 6) & 63);
    output += isNaN(third) ? '=' : chars.charAt(combined & 63);
  }
  return output;
}

function encodeImageKitOverlay(url) {
  return encodeURIComponent(encodeBase64Ascii(encodeURIComponent(url)));
}

function normalizeCompositeLogoUrl(url, width, height, logoWidth, logoHeight, background) {
  if (!url) return '';
  var canvasBackground = background || '00000000';
  return 'https://ik.imagekit.io/huangxd/tr:l-image,i-transparent.png,' +
    'w-' + width + ',h-' + height + ',bg-' + canvasBackground + ',lfo-center,l-image,ie-' +
    encodeImageKitOverlay(url) +
    ',w-' + logoWidth + ',h-' + logoHeight +
    ',cm-pad_resize,bg-' + canvasBackground + ',lfo-center,l-end,l-end/transparent.png';
}

function normalizePosterUrl(url) {
  return normalizeCompositeLogoUrl(url, 800, 1200, 640, 900);
}

function normalizeBackdropUrl(url) {
  return normalizeCompositeLogoUrl(url, 1200, 500, 800, 400);
}

function normalizeGroupPosterUrl(definition) {
  return 'https://images.weserv.nl/?url=' + encodeURIComponent(definition.iconUrl)
    + '&w=1200&h=675&fit=contain&cbg=00000000&output=png';
}

function normalizeGroupBackdropUrl(definition) {
  return 'https://images.weserv.nl/?url=' + encodeURIComponent(definition.iconUrl)
    + '&w=1200&h=675&fit=contain&cbg=00000000&output=png';
}

function toVideoItem(channel, playable) {
  var posterUrl = normalizePosterUrl(channel.logo);
  var item = {
    id: channel.url,
    type: 'url',
    title: channel.name,
    description: getGroupTitle(channel.group) + ' · IPTV 直播',
    coverUrl: posterUrl,
    posterPath: posterUrl,
    backdropPath: normalizeBackdropUrl(channel.logo),
    durationText: '直播',
    link: channel.url,
    playerType: 'app',
    genreTitle: getGroupTitle(channel.group),
  };
  if (playable === true) item.videoUrl = channel.url;
  return item;
}

function toGroupItem(definition, channels) {
  var item = toVideoItem(channels[0], false);
  var groupLink = 'iptv-group:' + definition.value;
  item.id = groupLink;
  item.link = groupLink;
  item.title = definition.title;
  item.description = channels.length + ' 个频道 · IPTV 直播';
  item.durationText = channels.length + ' 个频道';
  item.genreTitle = definition.title;
  item.coverUrl = normalizeGroupPosterUrl(definition);
  item.posterPath = item.coverUrl;
  item.backdropPath = normalizeGroupBackdropUrl(definition);
  return item;
}

function withEpisodePlaylist(items) {
  var playlist = items.map(function (item, index) {
    return Object.assign({}, item, { episode: index + 1 });
  });
  return items.map(function (item, index) {
    return Object.assign({}, item, {
      episode: index + 1,
      episodeItems: playlist,
    });
  });
}

async function loadList(params) {
  var channels = await fetchChannels(params || {});
  var items = [];
  for (var i = 0; i < GROUP_DEFINITIONS.length; i += 1) {
    var definition = GROUP_DEFINITIONS[i];
    var groupChannels = channels.filter(function (channel) {
      return channel.group === definition.value;
    });
    if (groupChannels.length) items.push(toGroupItem(definition, groupChannels));
  }
  return items;
}

async function loadDetail(link) {
  var channels = await fetchChannels({ source: DEFAULT_M3U_URL });

  if (link.indexOf('iptv-group:') === 0) {
    var groupValue = link.slice('iptv-group:'.length);
    var definition = getGroupDefinition(groupValue);
    if (!definition) return null;
    var categoryChannels = channels.filter(function (channel) {
      return channel.group === groupValue;
    });
    if (!categoryChannels.length) return null;

    var categoryDetails = withEpisodePlaylist(categoryChannels.map(function (channel) {
      return toVideoItem(channel, true);
    }));
    var categoryDetail = categoryDetails[0];
    categoryDetail.id = link;
    categoryDetail.link = link;
    categoryDetail.title = definition.title;
    categoryDetail.description = definition.title + ' · ' + categoryChannels.length + ' 个频道';
    categoryDetail.durationText = categoryChannels.length + ' 个频道';
    categoryDetail.genreTitle = definition.title;
    categoryDetail.coverUrl = normalizeGroupPosterUrl(definition);
    categoryDetail.posterPath = categoryDetail.coverUrl;
    categoryDetail.backdropPath = normalizeGroupBackdropUrl(definition);
    return categoryDetail;
  }

  var selected = null;
  for (var i = 0; i < channels.length; i += 1) {
    if (channels[i].url === link) {
      selected = channels[i];
      break;
    }
  }
  if (!selected) return null;

  var groupChannels = channels.filter(function (channel) {
    return channel.group === selected.group;
  });
  var details = withEpisodePlaylist(groupChannels.map(function (channel) {
    return toVideoItem(channel, true);
  }));
  for (var j = 0; j < details.length; j += 1) {
    if (details[j].id === link) return details[j];
  }
  return null;
}

async function search(params) {
  params = params || {};
  var keyword = String(params.keyword || params.query || '').trim().toLowerCase();
  if (!keyword) return [];

  var channels = await fetchChannels(params);
  var items = channels.filter(function (channel) {
    var haystack = [channel.name, channel.tvgName, channel.group, channel.id]
      .join('\n')
      .toLowerCase();
    return haystack.indexOf(keyword) >= 0;
  }).map(function (channel) {
    return toVideoItem(channel, false);
  });
  return items;
}
