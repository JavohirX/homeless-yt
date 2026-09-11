# homeless-yt

Skips the channel’s “here’s a trailer, a shelf, and a personality quiz” homepage and takes you straight to the videos. Because you clicked a creator, not a brochure.

A Chrome/Edge (Manifest V3) extension. Open `youtube.com/@someone` — or click a channel name on a watch page — and land on `/videos` instead of Home/Featured.

## Install

1. Clone this repo, or download it as a ZIP and unpack it.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select this folder.

Reload the extension after pulling updates, then hard-refresh any open YouTube tabs (Ctrl+Shift+R).

## What it redirects

| From | To |
| --- | --- |
| `/@user` | `/@user/videos` |
| `/@user/featured` | `/@user/videos` |
| `/channel/…`, `/c/…`, `/user/…` (same idea) | `…/videos` |

Other channel tabs (`/shorts`, `/playlists`, `/community`, …) are left alone.

Typed URLs, new tabs, and external links are redirected before the document loads. In-app clicks (YouTube is an SPA) are intercepted so Home does not render first.

## License

[MIT](LICENSE)
