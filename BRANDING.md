# Worklenz Branding & Customization Guide

This guide details how to customize and rebrand the Worklenz Employee Task, Time Tracking & Manager Approval application for your organization while preserving necessary license notices.

---

## 1. Overview of Brand Assets & Configuration Locations

| Branding Element | Location | Description |
| :--- | :--- | :--- |
| **Application Name & Title** | `worklenz-frontend/index.html`<br>`worklenz-frontend/public/manifest.json`<br>`worklenz-frontend/src/config/env.ts` | Global browser title, PWA install name, and metadata |
| **PWA Manifest & Installation** | `worklenz-frontend/public/manifest.json` | PWA name, short_name, description, theme_color, background_color, display mode |
| **Favicon & Web Icons** | `worklenz-frontend/favicon.ico`<br>`worklenz-frontend/public/favicon.ico`<br>`worklenz-frontend/public/assets/icons/` | Browser tab favicon, iOS apple-touch-icon, Android PWA home screen icons |
| **Navbar & Header Logos** | `worklenz-frontend/src/features/navbar/NavbarLogo.tsx`<br>`worklenz-frontend/src/features/navbar/navbar-logo.tsx` | Main navigation bar logo component (SVG/PNG) |
| **Color Palette & Theme Tokens** | `worklenz-frontend/src/styles/colors.ts`<br>`worklenz-frontend/src/shared/antd-imports.ts` | Primary color, accents, light/dark theme tokens |
| **Email Templates & Notifications** | `worklenz-backend/src/shared/email-templates.ts`<br>`worklenz-backend/src/shared/email.ts` | Transactional email header logos, brand colors, signature, and approval alerts |
| **Push & In-App Notifications** | `worklenz-frontend/public/sw.js`<br>`worklenz-backend/src/services/notifications/` | PWA service worker push notification titles, badge icons, and sender headers |

---

## 2. Rebranding Step-by-Step

### 2.1 Updating Application Name & Titles

1. **`worklenz-frontend/index.html`**:
   - Update `<title>Your App Name</title>`
   - Update `<meta name="application-name" content="Your App Name">`
   - Update `<meta name="apple-mobile-web-app-title" content="Your App Name">`

2. **`worklenz-frontend/public/manifest.json`**:
   ```json
   {
     "name": "Your Organization - Tasks & Approvals",
     "short_name": "TaskFlow",
     "description": "Employee Task, Time Tracking & Manager Approval System",
     "start_url": "/",
     "display": "standalone",
     "background_color": "#ffffff",
     "theme_color": "#1890ff"
   }
   ```

### 2.2 Updating Icons & Favicon

1. **Favicon**:
   - Replace `worklenz-frontend/public/favicon.ico` and `worklenz-frontend/favicon.ico` (multi-resolution 16x16, 32x32, 48x48).
2. **PWA Icons**:
   - Provide high-resolution PNGs at:
     - `worklenz-frontend/public/assets/icons/icon-192x192.png` (192x192 maskable)
     - `worklenz-frontend/public/assets/icons/icon-512x512.png` (512x512 maskable)

### 2.3 Customizing UI Logos & Colors

1. **Navbar Logo**:
   - Modify `worklenz-frontend/src/features/navbar/NavbarLogo.tsx` to render your organization's custom SVG or logo image.
2. **Theme Colors**:
   - Adjust `worklenz-frontend/src/styles/colors.ts` to customize primary brand hues, accent colors, and status colors (approved green `#52c41a`, adjusted blue `#1677ff`, pending orange `#faad14`, rejected red `#ff4d4f`).

### 2.4 Email & Transactional Notification Branding

1. **Email Templates**:
   - In `worklenz-backend/src/shared/email-templates.ts`:
     - Update company logo URL in header
     - Set brand primary color for buttons and dividers
     - Update footer copyright and organization name
2. **Push Notifications**:
   - In `worklenz-frontend/public/sw.js` (push event handler):
     - Update notification title prefix and badge icon path

---

## 3. Important License & Attribution Notice

> [!IMPORTANT]
> When applying custom branding, do **not** remove copyright notices or licensing headers from open-source source files (such as `LICENSE`, `NOTICE`, or header comment blocks) as required by open-source licenses.
