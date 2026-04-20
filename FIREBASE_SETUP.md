# FreshMart Firebase Setup

## 1. Add your Firebase web app config

Update [js/firebase-config.js](/tmp/automatex_firebase/js/firebase-config.js) with the config object from your Firebase project.

## 2. Enable products

Enable these Firebase services:

- Authentication: Email/Password
- Cloud Firestore

## 3. Collections used by the app

- `products`
- `orders`
- `users`

## 4. Admin access

Users are created with `role: "user"` in Firestore.

To promote an admin, edit the user document in `users/<uid>` and set:

```json
{
  "role": "admin"
}
```

## 5. Suggested Firestore rules

See [firebase/firestore.rules](/tmp/automatex_firebase/firebase/firestore.rules).

## 6. Local development

Serve the app from a local web server instead of opening only through `file://`.
