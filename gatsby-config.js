module.exports = {
  siteMetadata: {
    title: 'Theographic',
  },
  plugins: [
    {
      resolve: "gatsby-source-graphql",
      options: {
        typeName: "neo4j",
        fieldName: "neo4j",
        url: "https://theographic-api.herokuapp.com/"
        // url: "http://localhost:4000"
      },
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
