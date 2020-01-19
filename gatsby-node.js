/**
 * See: https://www.gatsbyjs.org/docs/node-apis/
 */

const path = require(`path`)

exports.createPages = ({ actions, graphql }) => {
  const { createPage } = actions

  return graphql(`
  {
    neo4j {
      Book {
        slug
      }
      Person {
        slug
      }
      Place {
        slug
      }
      EventGroup {
        slug
      }
    }
  }  
  `).then(result => {
    if (result.errors) {
      result.errors.forEach(e => console.error(e.toString()))
      return Promise.reject(result.errors)
    }

    //passages
    const books = result.data.neo4j.Book
    books.forEach(edge => {
      createPage({
        path: edge.slug, 
        component: path.resolve(`src/templates/passageTemplate.js`),
        context: {
          lookupName: edge.slug
        }
      })
    })

    //places
    const places = result.data.neo4j.Place
    places.forEach(edge => {
      createPage({
        path: 'place/' + edge.slug, 
        component: path.resolve(`src/templates/placeTemplate.js`),
        context: {
          lookupName: edge.slug
        }
      })
    })

    //people
    const people = result.data.neo4j.Person
    people.forEach(edge => {
      createPage({
        path: 'person/' + edge.slug, 
        component: path.resolve(`src/templates/personTemplate.js`),
        context: {
          lookupName: edge.slug
        }
      })
    })

    //periods
    const periods = result.data.neo4j.EventGroup
    periods.forEach(edge => {
      createPage({
        path: 'period/' + edge.slug, 
        component: path.resolve(`src/templates/periodTemplate.js`),
        context: {
          lookupName: edge.slug
        }
      })
    })
  })
}