# StressMitra — Cool Interactive Final

## Windows quick start

1. Open PowerShell in this folder.
2. Run:

```powershell
Remove-Item -Recurse -Force .venv -ErrorAction SilentlyContinue
py -3.11 -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

3. Open **http://127.0.0.1:8000**.

You can also double-click `start-stressmitra.cmd`.

## Demo accounts
- personnel01 / demo123
- welfare01 / demo123
- commander01 / demo123
- admin01 / demo123

## Google sign-in
Put your Google OAuth 2.0 Web Client ID in:
`config/google-client-id.txt`

Authorized JavaScript origin:
`http://127.0.0.1:8000`

## Notes
- The prototype uses a Random Forest model already included in `models/stress_model.joblib`.
- Runtime CSV processing uses Python's built-in `csv` module; Pandas is not required.
- Check-in sessions are persisted in SQLite so submitting a check-in does not unexpectedly send the user back to the sign-in page after a refresh/reload.
- Health-report PDFs are stored for authorised human review; the prototype does not diagnose from the PDF.


## Jamendo music setup

StressMitra now uses the Jamendo public music catalog instead of Spotify. The Music section searches Jamendo by recommendation category and plays returned catalog audio directly in the browser.

1. Create a Jamendo developer account and application in the Jamendo Developer Portal.
2. Copy the application's `client_id`.
3. Put only that value into `config/jamendo-client-id.txt`.
4. Restart StressMitra.

Jamendo's public read API uses the `client_id` query parameter; OAuth2 is only needed for protected/private or write operations. See the official API documentation for the current requirements.

The backend endpoint used by this prototype is:

`GET /api/jamendo/search?category=Calm`

Supported categories are `Calm`, `Focus`, `Energetic`, and `Romantic`. The backend calls Jamendo's `/v3.0/tracks/` endpoint, requests `mp32` audio, and returns only tracks that include a playable audio URL.

The application also respects Jamendo's `audiodownload_allowed` field; the player is for streaming/playback, not an automatic download feature.

Open the official documentation: https://developer.jamendo.com/v3.0/docs
