# Rex IPTV Widget

Rex/Forward IPTV widget with four category cards and channel selection through `loadDetail`.

## Import

```text
https://raw.githubusercontent.com/Hamster-Prime/rex-iptv-widget/main/iptv.js
```

The default M3U source is `http://10.0.0.254/IPTV.m3u`. The playback device must be able to reach that address and the stream hosts.

## Contents

- `iptv.js` — widget module, version 1.4.2
- `iptv.test.js` — Node.js unit and live-source integration tests
- `icons/cctv.png` — 央视频道
- `icons/satellite.png` — 卫视频道
- `icons/featured.png` — 央视精选
- `icons/radio.png` — 广播频道

## Verify

```bash
node --test iptv.test.js
RUN_LIVE_TEST=1 node --test iptv.test.js
```
