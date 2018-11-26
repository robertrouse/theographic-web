Changes pushed to this repo will automatically trigger a deployment to Netlify at https://theographic.netlify.com/

## Setup

1. You will need the Gatsby-cli client to develop and build the site
``` sh
npm install --global gatsby-cli
```

2. Install other dependent packages

``` sh
npm install
```

3. Set airtable API key in an environment variable. (e-mail robert@viz.bible to obtain a key)
``` sh
export AIRTABLE_API_KEY=keycEYIacbyYglArc
```

## Develop
To test locally, run:
``` sh
gatsby develop
```

To build all static pages locally, run:
``` sh
gatsby build
```
