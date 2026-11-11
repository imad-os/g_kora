todo:

remove themes
on channelUP Down : navigate dates ; channel up date+1day , channelDown date-1day


{
    "get": "fixtures",
    "parameters": {
        "live": "all"
    },
    "errors": {
        "requests": "You have reached the request limit for the day, Go to https://dashboard.api-football.com to upgrade your plan."
    },
    "results": 0,
    "paging": {
        "current": 1,
        "total": 1
    },
    "response": []
}
## Football data source (Settings > Football Data Source)

- **Wrapped API** (default): requests go to the Cloudflare Worker route `footballRequest` (repo imad-os/fb, `cloudflare/`; was a Firebase function before 1.3.3)
  (`https://iptv-lists.mypc-app.workers.dev/footballRequest?endpoint=<path>&<params>`), which holds and
  rotates the API-Football keys. No fallback: its errors are shown (page, red badge, widget). Override the address with
  `wrappedUrl` in the app's config (App Store Manager > Config).
- **Direct football-api**: the TV asks API-Football (RapidAPI / api-sports) with the built-in keys.

A badge next to the date shows the source in use (red with the error when its last request failed).
The choice is per profile (`appConfig.apiSource`) and is synced to the widget and the alerts service.
Proof: `node tests/api-source-proof.mjs <shots dir>` (Playwright; every outside host answered locally).
