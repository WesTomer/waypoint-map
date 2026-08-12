# Waypoint Map — V1

An offline-first iPhone web app for placing red waypoints over a base image/PDF and attaching photos to each waypoint.


## V1 features

- Multiple projects
- Import JPG/PNG/etc. images
- Import PDFs (PDF.js is loaded from CDN)
- Place, move-by-recreation, edit, and delete red waypoints
- Attach multiple photos to each waypoint
- View photos full-screen
- Waypoint names and notes
- IndexedDB persistence
- Project export/import
- Home Screen web-app manifest
- Service-worker caching for the app shell

## Important iPhone setup

For the full PWA/offline behavior, the app must be served from an HTTP/HTTPS website. A file opened directly from Google Drive/Files (`file://`) is not the correct deployment model for a service-worker PWA.

The easiest free deployment is GitHub Pages:

1. Create a GitHub repository.
2. Upload this entire folder.
3. Enable GitHub Pages for the repository.
4. Open the resulting HTTPS URL in Safari on the iPhone.
5. Use Safari's Share menu → Add to Home Screen and leave "Open as Web App" enabled.
6. Open the new Home Screen icon once while online so the app shell is cached.

Safari on current iOS can add websites to the Home Screen as web apps. The manifest and service worker are still included for the normal PWA architecture.

## Google Drive

Google Drive is fine as a transfer/backup location for the source files or ZIP. It should not be the runtime host for this PWA.

## Data

Projects and photos are stored locally in IndexedDB. They are not uploaded to a server.

Use Export periodically to create a `.waypoint.json` backup. The export contains the base document and photos, so large projects can create large files.

## Known V1 limitation

PDF rendering uses PDF.js 4.10.38 from cdnjs. The app itself and IndexedDB data are local, but the first PDF use requires the PDF.js files to be reachable or already cached by the browser. A later build can bundle PDF.js locally to remove that remaining external dependency.
