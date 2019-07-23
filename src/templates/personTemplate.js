import React from 'react'
import { graphql } from 'gatsby'
import { Helmet } from 'react-helmet'
import '../components/layout.css'
import EventList from '../components/EventList'
  
class Person extends React.Component {

  render () {
    const {data} = this.props
    return (
      <>
        <Helmet>
          <meta charSet="utf-8"/>
          <title>{data.neo4j.Person[0].name}</title>
          <meta content="{data.neo4j.Person[0].name}" property="og:title"/>
          <meta content="width=device-width, initial-scale=1" name="viewport"/>
        </Helmet>
        <div className="container">
          <h1 className="sticky-title">{data.neo4j.Person[0].name}</h1>

          <p className="container">{data.neo4j.Person[0].description}</p>
          <div className="citation">M.G. Easton M.A., D.D., Illustrated Bible Dictionary, Third Edition</div>

          <div className="div-block"/>
          {data.neo4j.timeline.length > 0 && (
            <>
              <h3 className="heading-3">Timeline</h3>
              <EventList eventData = {data.neo4j.timeline}/>
            </>
            )
          } 
          <div className="footer"/>
        </div>
      </>
    )
  }
}

export default Person

export const pageQuery = graphql`
query ($lookupName: String!) {
  neo4j {
    Person(filter: {slug: $lookupName}) {
      slug
      name
      description
      gender
      parentOf {
        name
        slug
      }
      childOf {
        name
        slug
      }
    }
    timeline: Event(orderBy:sortKey_asc, filter: {participants_some: {slug: $lookupName}}) {
      title
      sequence
      sortKey
      year: yearsOccurred(orderBy: year_asc, first: 1) {
        formattedYear
      }
      eventGroup {
        title
      }
      verses(orderBy: verseId_asc) {
        verseId
        osisRef
        title
      }
      placeOccurred(orderBy: name_asc) {
        name
        slug
      }
      participants(orderBy: name_asc, filter: {slug_not: $lookupName}) {
        name
        slug
      }
    }
  }
}
`
