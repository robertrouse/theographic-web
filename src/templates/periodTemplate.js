import React from 'react'
import { graphql, Link } from 'gatsby'
import { Helmet } from 'react-helmet'
import Layout from '../components/layout.js'

class Period extends React.Component {

  render() {
    const { data } = this.props
    return (
      <Layout>
        <Helmet>
          <meta charSet="utf-8" />
          <title>{data.neo4j.EventGroup[0].title}</title>
          <meta content="{data.neo4j.EventGroup[0].title}" property="og:title" />
          <meta content="width=device-width, initial-scale=1" name="viewport" />
        </Helmet>
        <div className="container">
          <h1 className="sticky-title">{data.neo4j.EventGroup[0].title}</h1>
          {data.neo4j.EventGroup[0].years.map(year => (
            <>
            <div className="div-block"/>
            <div className="year-row">
              <div className="year-label">{year.formattedYear}</div>
              <div className="year-content">
                {year.events.map( event => (
                  <>
                  <div>
                    <div>{event.title}</div>
                    {event.participants.length > 0 &&
                    <div>People: {event.participants.map((person,i) =>
                        <>
                        {i > 0 && ', '}
                        <Link key={i} to={'/person/' + person.slug}>{person.name}</Link>
                        </>
                      )}
                    </div>}
                    {event.placeOccurred.length > 0 &&
                    <div>Place(s): {event.placeOccurred.map((place,i) =>
                        <>
                        {i > 0 && ', '}
                        <Link key={i} to={'/place/' + place.slug}>{place.name}</Link>
                        </>
                      )}
                    </div>}
                    {event.verses.length > 0 &&
                    <div>Passages: 
                      <Link to={event.verses[0].osisRef.split('.')[0].toLowerCase() + '#' + event.verses[0].osisRef}>
                        {event.verses[0].title}-{event.verses[event.verses.length-1].osisRef.split('.')[2]}
                      </Link>
                    </div>
                    }
                  </div>
                  </>
                ))}
              </div>
            </div>
            </>
          ))}
          <div className="footer" />
        </div>
      </Layout>
    )
  }
}

export default Period

export const pageQuery = graphql `
query ($lookupName: String!){
  neo4j {
    EventGroup(filter:{slug: $lookupName}) {
      title
      years(orderBy: year_asc) {
        formattedYear
        year
        events(orderBy: sequence_asc, filter: {eventGroup_single: {slug: $lookupName}}) {
          title
          sequence
          placeOccurred(orderBy: name_asc) {
            name
            slug
          }
          participants(orderBy: name_asc) {
            name
            slug
          }
          verses(orderBy: verseId_asc) {
            verseId
            osisRef
            title
          }
        }
      }
    }
  }
}
`