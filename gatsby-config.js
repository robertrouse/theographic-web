module.exports = {
  siteMetadata: {
    title: 'Theographic',
  },
  plugins: [
    {
      resolve: 'gatsby-source-airtable',
      options: {
        apiKey: 'YOUR_KEY_HERE',
        tables: [
          {
            baseId: 'app5UK4s70d5PwupX',
            tableName: 'Books',
            tableView: 'Grid view',
            tableLinks: ['Chapters'],
          },
          {
            baseId: 'app5UK4s70d5PwupX',
            tableName: 'Chapters',
            tableView: 'Grid view',
            tableLinks: ['Book'],
          },
          {
            baseId: 'app5UK4s70d5PwupX',
            tableName: 'Verses',
            tableView: 'Grid',
            tableLinks: ['Book', 'Chapter', 'Places', 'People', 'Events_Described'],
          },
          {
            baseId: 'app5UK4s70d5PwupX',
            tableName: 'Places',
            tableView: 'Grid View',
            tableLinks: ['Events here', 'Books', 'Has been here','People born', 'People died','Verses'],
          },
          {
            baseId: 'app5UK4s70d5PwupX',
            tableName: 'Periods',
            tableView: 'Era Groups',
          },
          {
            baseId: 'app5UK4s70d5PwupX',
            tableName: 'People',
            tableView: 'Grid view',
            tableLinks: [
              'Member of Groups',
              'Mother',
              'Father',
              'Birth_Place',
              'Death_Place',
              'Events',
              'Children',
              'Siblings',
              'Half_Siblings_Same_Mother',
              'Half_Siblings_Same_Father',
              'Chapters_Written',
              'Has Been to',
              'Verses',
              'Chapters Written',
              'Personal network'
            ],
          },
          {
            baseId: 'app5UK4s70d5PwupX',
            tableName: 'People Groups',
            tableView: 'Grid view',
          },
          {
            baseId: 'app5UK4s70d5PwupX',
            tableName: 'Events',
            tableView: 'Grid View',
            tableLinks: ['People', 'Places', 'Preceding_Event','Start Year','Verses_Described'],
          }
        ]
      }
    },
      'gatsby-plugin-react-helmet',
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
        icon: 'src/images/gatsby-icon.png', // This path is relative to the root of the site.
      },
    },
  ],
}
