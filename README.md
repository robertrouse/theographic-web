# Overview
Theographic will solve two basic problems with Bible applications: poor search experience and difficult navigation among resources. Search results will differentiate people, places, events, and other subjects instead of simple word matching. After arriving on a page, Theographic serves up all collected facts about a subject. Users arrive at these pages with one click on a subject’s name wherever it appears. Learn more: https://www.youtube.com/watch?v=w9qHbpYZX3k

_Visit the Projects tab for open tasks related to the initial build_

_Changes pushed to the master branch will automatically trigger a deployment to Netlify at https://theographic.netlify.com/_

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
export AIRTABLE_API_KEY=your_api_key
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
