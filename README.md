# Abdullah Ali Portfolio — shared Admin Panel fix

## What was wrong
The previous `admin.js` saved portfolio content and admin credentials in `localStorage`. That storage belongs to one browser profile, so another browser/device saw old content. GitHub Pages is static hosting and cannot run a secure API or write shared files.

## Fixed version
This package adds a same-origin Node.js backend:
- Public portfolio reads published content from `/api/content`.
- Admin login is verified server-side; passwords are stored as salted scrypt hashes in `.private/admin-auth.json`.
- Profile, projects, services, theme, and section settings save to the server's `content.json`.
- Admin account changes are stored on the server and work for future logins from other browsers.
- Session cookie is HttpOnly and SameSite=Lax; login attempts are rate-limited.
- `.private/` is blocked from public static requests and excluded from Git.

## Run on Windows (local test)
1. Install Node.js 18 or newer.
2. Extract this ZIP to a normal folder.
3. Open Command Prompt in that folder.
4. Set a first admin login (use your own private password, at least 12 characters):
   `set ADMIN_USERNAME=your-own-username`
   `set ADMIN_PASSWORD=your-own-long-private-password`
5. Start the site: `node server.js`
6. Open `http://localhost:3000` (do not open `index.html` by double-clicking).
7. Open `http://localhost:3000/admin.html`, sign in, edit settings, then click **Save changes**.
8. To test another browser on the same computer, open the same localhost URL there. To test another device on the same Wi-Fi, use the computer's LAN IP and allow Node.js through Windows Firewall for private networks only.

On first start, `.private/admin-auth.json` is created. Keep `.private/` private and backed up securely. If you change admin credentials in the panel, the server stores the new hashed password. Environment variables are only used to create the initial account when no auth file exists.

## Feature/test status
- Tested: public pages serve; admin login accepts correct credentials and rejects incorrect credentials; unauthenticated content writes are rejected; authenticated profile/theme content saves and is immediately visible to a separate client; account updates reject an incorrect current password, invalidate old credentials, and accept the new credentials; logout invalidates the session; private auth files are not publicly served; malformed content is rejected.
- Admin features implemented in this package: profile/contact fields, SEO text, social links, projects (add/edit/delete), services (add/delete), skills/tools, education/experience, theme/accent, section visibility, import/export backup, and admin credential changes. Click **Save changes** after editing content.
- Not implemented in this package: AI customer chat/provider integration, media uploads, inquiry management, testimonials/FAQ editing, and a visual page builder. AI controls are explicitly marked unavailable so they do not appear to work when they are not connected.

## Important hosting limitation
**Uploading this package to GitHub Pages alone will not activate the backend.** GitHub Pages cannot run `server.js`; do not publish this version as a static-only site expecting shared saves to work. To make changes sync over the public internet, deploy the whole Node.js app to a Node-capable host and use persistent storage/volume for `content.json` and `.private/admin-auth.json`. Some free hosting tiers sleep, reset files, or do not provide persistent disks. Verify persistence on the chosen host and configure HTTPS before using it with real credentials. Never commit `.private/` or real passwords to GitHub.

## Notes
- The session store is in memory; after a server restart, sign in again.
- Keep backups of `content.json` and the private `.private` directory.
- Do not use `file://` URLs for this version; use the server URL.
