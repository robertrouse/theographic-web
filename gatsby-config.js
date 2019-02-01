module.exports = {
  siteMetadata: {
    title: 'Theographic',
  },
  plugins: [
    {
      resolve: "gatsby-source-graphql",
      options: {
        typeName: "Neo4j",
        fieldName: "neo4j",
        url: "http://157.230.95.117:7474/graphql/",
        headers: {
          //Authorization: `Basic ${process.env.NEO4J_KEY}`,
          Authorization: "Basic dGhlb2RldjpiaWJsZWdyYXBo",
          //Authorization: process.env.NEO4J_KEY,
        },
      },
    },
    {
      resolve: 'gatsby-source-airtable',
      options: {
        apiKey: process.env.AIRTABLE_API_KEY,
        tables: [
          {
            baseId: 'app5UK4s70d5PwupX',
            tableName: 'books',
            tableView: 'Grid view',
            tableLinks: ['chapters','verses'],
          },
          {
            baseId: 'app5UK4s70d5PwupX',
            tableName: 'chapters',
            tableView: 'Grid view',
            tableLinks: ['book','writer','verses'],
          },
          {
            baseId: 'app5UK4s70d5PwupX',
            tableName: 'verses',
            tableView: 'Grid view',
            tableLinks: ['book', 'chapter', 'places', 'people', 'eventsDescribed','eventsReferenced'],
          },
          {
            baseId: 'app5UK4s70d5PwupX',
            tableName: 'places',
            tableView: 'Grid view',
            tableLinks: ['eventsHere', 'booksWritten', 'hasBeenHere','peopleBorn', 'peopleDied','verses'],
          },
          {
            baseId: 'app5UK4s70d5PwupX',
            tableName: 'periods',
            tableView: 'Grid view',
            tableLinks: ['peopleBorn', 'peopleDied', 'events','booksWritten'],
          },
          {
            baseId: 'app5UK4s70d5PwupX',
            tableName: 'people',
            tableView: 'Grid view',
            tableLinks: [
              'memberOf',
              'mother',
              'father',
              'birthPlace',
              'deathPlace',
              'events',
              'children',
              'siblings',
              'halfSiblingsSameMother',
              'halfSiblingsSameFather',
              'chaptersWritten',
              'hasBeenTo',
              'personalNetwork',
              'verses'
            ],
          },
          {
            baseId: 'app5UK4s70d5PwupX',
            tableName: 'peopleGroups',
            tableView: 'Grid view',
            tableLinks: ['members','verses','events'],
          },
          {
            baseId: 'app5UK4s70d5PwupX',
            tableName: 'events',
            tableView: 'Grid view',
            tableLinks: ['participants','participantGroups', 'placeOccurred', 'startYear','versesDescribed'],
          }
        ]
      }
    },
      'gatsby-plugin-react-helmet',
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        name: `maps`,
        path: `${__dirname}/src/images/maps`,
      },
    },
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        name: `images`,
        path: `${__dirname}/src/images`,
      },
    },
    'gatsby-transformer-sharp',
    'gatsby-plugin-sharp',
    {
      resolve: `gatsby-plugin-manifest`,
      options: {
        name: 'gatsby-starter-default',
        short_name: 'starter',
        start_url: '/',
        background_color: '#663399',
        theme_color: '#663399',
        display: 'minimal-ui',
        icon: 'src/images/og-square-100.png', 
      },
    },
    {
      resolve: `gatsby-plugin-google-analytics`,
      options: {
        trackingId: "UA-34750687-3",
        head: false,
        respectDNT: true,
      },
    },
  ],
}
