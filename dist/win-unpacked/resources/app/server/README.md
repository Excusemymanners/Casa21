Local development

To run the local Express server (for development outside Vercel):

```bash
# start server normally
node server/server.js

# or explicitly allow start even if VERCEL is set
DISABLE_SERVER=false node server/server.js
```

On Vercel you should not run this persistent server; API handlers live in the `api/` folder and are deployed as serverless functions.
