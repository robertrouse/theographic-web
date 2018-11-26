/**
 * Implement Gatsby's Node APIs in this file.
 *
 * See: https://www.gatsbyjs.org/docs/node-apis/
 */

// You can delete this file if you're not using it
const path = require(`path`)

exports.onCreateNode = ({node, actions, getNode}) => {
  const {createNodeField} = actions
  let slug

  if (node && node.internal.type === `Airtable` && node.table === `Places`) {
    slug = `/place/${node.data.Place_Lookup.replace(/ /g, '-')
      .replace(/[,&]/g, '')}/`

    // Add slug as a field on the node.
    createNodeField({node, name: `slug`, value: slug})
  } else if (node && node.internal.type === `Airtable` && node.table === `People`) {
    slug = `/person/${node.data.Person_Lookup.replace(/ /g, '-')
      .replace(/[,&]/g, '')}/`

    // Add slug as a field on the node.
    createNodeField({node, name: `slug`, value: slug})
  }
}

exports.createPages = ({graphql, actions}) => {

  const placesPages = makingPages(`src/templates/placeTemplate.js`, 'Places', 'Place_Lookup', graphql, actions)
  const peoplePages = makingPages(`src/templates/personTemplate.js`, 'People', 'Person_Lookup', graphql, actions)

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
            allAirtable(filter: { table: { eq: "${table}" }} 
              // limit:100
            ) {
              edges {
                node {
                  data {
                    ${lookupName}
                  }
                  fields {
                    slug
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
            path: edge.node.fields.slug, // required, we don't have frontmatter for this page hence separate if()
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


