/**
 * Implement Gatsby's Node APIs in this file.
 *
 * See: https://www.gatsbyjs.org/docs/node-apis/
 */

const path = require(`path`)

exports.onCreateNode = ({node, actions, getNode}) => {
  const {createNodeField} = actions
  let urlSlug

  if (node && node.internal.type === `Airtable` && node.table === `places`) {
    urlSlug = `/place/${node.data.slug}/`

    // Add slug as a field on the node.
    createNodeField({node, name: `urlSlug`, value: urlSlug})
  } else if (node && node.internal.type === `Airtable` && node.table === `people`) {
    urlSlug = `/person/${node.data.slug}/`

    // Add slug as a field on the node.
    createNodeField({node, name: `urlSlug`, value: urlSlug})
  }
}

exports.createPages = ({graphql, actions}) => {

  const placesPages = makingPages(`src/templates/placeTemplate.js`, 'places', 'placeLookup', graphql, actions)
  const peoplePages = makingPages(`src/templates/personTemplate.js`, 'people', 'personLookup', graphql, actions)

  return peoplePages;

}

function makingPages (templatePath, table, lookupName, graphql, actions) {
  const {createPage, createRedirect} = actions
  return new Promise((resolve, reject) => {
    const template = path.resolve(templatePath)

    // Query for all markdown "nodes" and for the slug we previously created.
    resolve(
      graphql(
        `
          {
            allAirtable(filter: { table: { eq: "${table}" }} ) {
              edges {
                node {
                  data {
                    ${lookupName}
                    slug
                  }
                  fields {
                    urlSlug
                  }
                }
              }
            }
          }
        `
      ).then(result => {
        if (result.errors) {
          result.errors.forEach(error => {
            console.log(error)
          })

          reject(result.errors)
        }

        result.data.allAirtable.edges.forEach(edge => {
          createPage({
            path: edge.node.fields.urlSlug, // required, we don't have frontmatter for this page hence separate if()
            component: template,
            context: {
              lookup: edge.node.data[lookupName],
              wideMap: edge.node.data[lookupName] + "-wide.png",
              detailMap: edge.node.data[lookupName] + "-detail.png"
            }
          })
        })

        return
      })
    )
  })
}


