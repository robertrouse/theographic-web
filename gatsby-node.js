/**
 * See: https://www.gatsbyjs.org/docs/node-apis/
 */

const path = require(`path`)

exports.createPages = ({graphql, actions}) => {

  const placesPages = makingPages(`src/templates/placeTemplate.js`, 'Place', '/place/', graphql, actions)
  // const peoplePages = makingPages(`src/templates/personTemplate.js`, 'Person', '/person/', graphql, actions)
  const periodPages = makingPages(`src/templates/periodTemplate.js`, 'EventGroup', '/period/', graphql, actions)
  const passagePages = makingPages(`src/templates/passageTemplate.js`, 'Book', '/', graphql, actions)
  
  return placesPages, passagePages; //,peoplePages,periodPages;
}

function makingPages (templatePath, entityType, urlPrefix, graphql, actions) {
  const {createPage} = actions
  return new Promise((resolve, reject) => {
    const template = path.resolve(templatePath)

    resolve(
      graphql(
        `
        {
          neo4j {
            table: ${entityType} {
              slug
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
        var uniqueItems = [...new Set(result.data.neo4j.table)]
        uniqueItems.forEach(edge => {
          createPage({
            path: urlPrefix + edge.slug, 
            component: template,
            context: {
              lookupName: edge.slug,
              wideMap: edge.slug + "_wide.png"
            }
          })
        })
        return
      })
    )
  })
}