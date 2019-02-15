import React from 'react'
import { graphql } from 'gatsby'
import { Helmet } from 'react-helmet'
import '../components/layout.css'
import EventList from '../components/EventList';

// Taken from https://stackoverflow.com/questions/14446511/most-efficient-method-to-groupby-on-a-array-of-objects?rq=1
const groupBy = function (xs, key) {
  return xs.reduce(function (rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x)
    return rv
  }, {})
}
  
class Person extends React.Component {

  render () {
    const {data} = this.props
    return (
      <>
        <Helmet>
          <meta charSet="utf-8"/>
          <title>People</title>
          <meta content="{data.neo4j.Person[0].name}" property="og:title"/>
          <meta content="width=device-width, initial-scale=1" name="viewport"/>
        </Helmet>
        <div className="container">
          <h1 className="heading">{data.neo4j.Person[0].name}</h1>

          <p className="container">{data.neo4j.Person[0].description}</p>
          <div className="citation">M.G. Easton M.A., D.D., Illustrated Bible Dictionary, Third Edition</div>

          <div className="div-block"/>
          <h3 className="heading-3">Timeline</h3>
          {data.neo4j.timeline.length > 0 &&<EventList eventData = {data.neo4j.timeline}/>}

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
    timeline: EventGroup(orderBy: sortKey_asc, filter: {events_some: {participants_single: {slug: $lookupName}}}) {
      title
      sortKey
      years(orderBy: year_asc) {
        formattedYear
        year
        events(orderBy: sequence_asc, filter: {participants_some: {slug: $lookupName}}) {
          title
          sequence
          verses(orderBy: verseId_asc) {
            verseId
            osisRef
            title
          }
          placeOccurred(orderBy: name_asc) {
            name
            slug
          }
          participants(orderBy: name_asc, filter: {slug_not : $lookupName}) {
            name
            slug
          }
        }
      }
    }
  }
}
`
