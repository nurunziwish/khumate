{
  "functions": {
    "api/index.js": {
      "includeFiles": "khumate-client/**",
      "maxDuration": 60
    }
  },
  "rewrites": [
    { "source": "/(.*)", "destination": "/api" }
  ]
}