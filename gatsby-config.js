module.exports = {
  siteMetadata: {
    title: 'Theographic: A Knowledge Graph of the Bible',
  },
  // flags: { QUERY_ON_DEMAND: true },
  plugins: [
    {
      resolve: "gatsby-source-graphql",
      options: {
        typeName: "neo4j",
        fieldName: "neo4j",
        url: "https://api.viz.bible/"
      },
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
    `gatsby-plugin-material-ui`,
    {
      resolve: `gatsby-plugin-manifest`,
      options: {
        name: 'Theographic',
        short_name: 'Theographic',
        start_url: '/',
        background_color: '#663399',
        theme_color: '#663399',
        display: 'minimal-ui',
        icon: 'src/images/og-square-100.png', 
      },
    },
  ],
}
