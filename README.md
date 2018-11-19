## Setup

1. You will need the Gatsby-cli client to develop and build the site
``` sh
npm install --global gatsby-cli
```

2. Install other dependent packages

``` sh
npm install
```

## Configure
Find this section in gatsby-config.js and replace it with a valid Airtable API key. Obtain this key by sending an email to robert@viz.bible.
```
resolve: 'gatsby-source-airtable',
      options: {
        apiKey: 'YOUR_KEY_HERE',
```

## Develop
To test locally, run:
``` sh
gatsby develop
```

## Deploy
To build all static pages and optimized code, run:
``` sh
gatsby build
```