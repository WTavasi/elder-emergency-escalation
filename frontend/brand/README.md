# App icon

MzaziCare's icon: a white M on MzaziCare red (`#9B0F1C`), with the care rings spreading
from the bottom-left corner as they do on the sign-in screens. These drawings are the
source; every icon in the app and the console is made from them.

| File | What it is |
| --- | --- |
| `app-icon.svg` | The whole icon, square. The source for iPhone, older Android, and the console. |
| `app-icon-background.svg` | Android's adaptive icon, back layer: the red and the rings. |
| `app-icon-foreground.svg` | Android's adaptive icon, front layer: the M alone, inside the circle no phone crops. Also the themed icon of Android 13 and later. |
| `app-icon-1024.png` | The whole icon at 1024 pixels, for stores and documents. |

## Where the icons are

- **iPhone:** `frontend/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/`, every size
  `Contents.json` lists, with no transparency, as Apple requires.
- **Android:** `ic_launcher.png` in each `mipmap-*` folder (48 to 192 pixels);
  `ic_launcher_background.png` and `ic_launcher_foreground.png` beside them (108 to 432
  pixels); `mipmap-anydpi-v26/ic_launcher.xml`, which puts the layers together; and
  `drawable/ic_notification.xml`, the white M Android shows in the status bar for a
  notification, set in `AndroidManifest.xml`.
- **Console:** `frontend/dashboard/public/`: `favicon.svg` and `favicon-32.png` for the
  browser tab, `apple-touch-icon.png` (180), and `icon-192.png` and `icon-512.png` with
  `site.webmanifest` for a phone's home screen.

## Changing it

Edit the SVGs, then make each PNG again from them at the sizes above with any tool that
turns an SVG into a PNG. The adaptive layers are drawn on Android's 108dp canvas, of which
only the middle 72dp shows: keep the M within the middle 66dp circle. Flatten the iPhone
icons onto the red so they have no transparency.
