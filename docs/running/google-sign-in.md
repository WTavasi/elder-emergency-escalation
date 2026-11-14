# Google sign-in on the console

Optional. Lets an administrator sign in to the console with Google.

Optional. Without it the console signs in with a phone number or an email address, and
shows no Google button. With it, an administrator whose account has a Gmail address can
sign in with Google instead. It never creates an account, and only works for
administrators. About ten minutes the first time.

## Step 1. Make an OAuth client in Google Cloud

1. Go to https://console.cloud.google.com and sign in with any Google account.
2. At the top left, open the project list and choose **New project**. Name it
   `MzaziCare` and click **Create**. Make sure it is the selected project afterwards.
3. In the search bar at the top, type **Google Auth Platform** and open it. Click
   **Get started**.
4. Fill in the app information: app name `MzaziCare Operations`, and your own email as
   the support email. Click **Next**.
5. For **Audience**, choose **External**, then **Next**. For contact information, your
   email again, then **Next**, tick the agreement, and click **Create**.
6. In the left menu, open **Audience**. Under **Test users**, click **Add users** and add
   the Gmail address you will sign in with. While the app is in testing, only addresses
   listed here can use it, which is exactly right for a project like this.
7. In the left menu, open **Clients**, then **Create client**.
   - **Application type:** Web application
   - **Name:** `MzaziCare console (local)`
   - **Authorised JavaScript origins:** click **Add URI** and enter
     `http://localhost:5173`. Add `http://localhost` as well, which Google asks for when
     testing on localhost.
   - Leave **Authorised redirect URIs** empty: the console uses a pop-up, not a redirect.
8. Click **Create**. Copy the **Client ID**, which ends in `.apps.googleusercontent.com`.
   You do not need the client secret: nothing in MzaziCare uses it.

## Step 2. Give the client ID to the API

Open `backend/.env` and add the line, with your own ID:

```
GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
```

The client ID is not a secret (the console shows it to every browser), but `.env` is where
the API reads its settings. Restart `npm run dev`.

## Step 3. Put your Gmail address on the administrator account

Google proves an email address, and the API looks for an administrator with that
address. The seeded administrator's is `admin@mzazicare.example`, so change it to your
Gmail. In Postman, run **1. Sign in → Administrator**, then send this as the
administrator (Auth tab, Bearer token `{{adminToken}}`):

```
PATCH {{apiBase}}/auth/me
{ "email": "your.name@gmail.com" }
```

Or with curl, using the administrator's access token:

```bash
curl -X PATCH http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer <adminToken>" -H "Content-Type: application/json" \
  -d '{"email":"your.name@gmail.com"}'
```

Re-seeding the database puts the old address back.

## Step 4. Try it

Reload the console's sign-in page. **Sign in with Google** appears under the password.
Choose your Gmail in the pop-up, and you land on the board.

A Gmail address that is on no administrator account is refused with "No administrator
account uses this Google address". That is the system working.

## What it changes

Google's script is only fetched when the API has a client ID, and only by the sign-in
page. Once it is in a page it stays there with the console's own access, and the
screens after sign-in show elders' names and addresses, so the console reloads itself
after any sign-in on a page where Google's script was loaded. The signed-in page never
fetches it. A deployment that serves the console with a content security policy has to
allow `https://accounts.google.com` for scripts, frames and connections on the sign-in
page.

---

[Back to running the system](../README.md)
