/**
 * See: https://www.gatsbyjs.org/docs/node-apis/
 */

const path = require(`path`)

exports.onCreateNode = ({node, actions, getNode}) => {
  const {createNodeField} = actions
  let urlSlug

  if (node && node.internal.type === `Airtable` && node.table === `places`) {
    urlSlug = `/place/${node.data.slug}/`
  } else if (node && node.internal.type === `Airtable` && node.table === `people`) {
    urlSlug = `/person/${node.data.slug}/`
  } else if (node && node.internal.type === `Airtable` && node.table === `chapters`) {
    urlSlug = `/${node.data.slug}/`
  }
  createNodeField({node, name: `urlSlug`, value: urlSlug})
}

exports.createPages = ({graphql, actions}) => {

  const placesPages = makingPages(`src/templates/placeTemplate.js`, 'places', 'placeLookup', graphql, actions)
  const peoplePages = makingPages(`src/templates/personTemplate.js`, 'people', 'personLookup', graphql, actions)
  const passagePages = makingPages(`src/templates/passageTemplate.js`, 'chapters', 'chapterLookup', graphql, actions)
  
  return peoplePages,placesPages,passagePages;

}

function makingPages (templatePath, table, lookupName, graphql, actions) {
  const {createPage} = actions
  return new Promise((resolve, reject) => {
    const template = path.resolve(templatePath)

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
            path: edge.node.fields.urlSlug, 
            component: template,
            context: {
              lookup: edge.node.data[lookupName],
              wideMap: edge.node.data[lookupName] + "_wide.png"
            }
          })
        })
        return
      })
    )
  })
}