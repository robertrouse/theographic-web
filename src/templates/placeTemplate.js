import React from 'react'
import { graphql } from 'gatsby'
import { Helmet } from 'react-helmet'
import Img from 'gatsby-image';
import '../components/layout.css'
import EventList from '../components/EventList'

class Place extends React.Component {

  render () {
    const {data} = this.props
    return (
      <>
        <Helmet>
          <meta charSet="utf-8"/>
          <title>{data.neo4j.Place[0].name}</title>
          <meta content="{data.neo4j.Place[0].name}" property="og:title"/>
          <meta content="width=device-width, initial-scale=1" name="viewport"/>
        </Helmet>
        <div className="container">
          <h1 className="heading">{data.neo4j.Place[0].name}</h1>
          {data.wideMap && (<Img fluid={data.wideMap.childImageSharp.fluid} className="map"/>)}
          <p className="container">{data.neo4j.Place[0].description}</p>
          <div className="citation">M.G. Easton M.A., D.D., Illustrated Bible Dictionary, Third Edition</div>

          <div className="div-block"/>
          <h3 className="heading-3">Timeline</h3>
          {data.neo4j.timeline.length > 0 && <EventList eventData = {data.neo4j.timeline}/>}

          <div className="footer"/>
        </div>
      </>
    )
  }
}

export default Place

export const pageQuery = graphql`
query ($lookupName: String!, $wideMap: String!) {
  wideMap: file(relativePath: {eq: $wideMap}) {
    childImageSharp {
      fluid(maxWidth: 767) {
        ...GatsbyImageSharpFluid
      }
    }
  }
  neo4j {
    Place(filter: {slug: $lookupName}) {
      name
      description
      hasBeenHere {
        name
        slug
      }
      verses {
        osisRef
        title
      }
    }
    timeline: EventGroup(orderBy: sortKey_asc, filter: {events_some: {placeOccurred_some: {slug: $lookupName}}}) {
      title
      sortKey
      years(orderBy: year_asc) {
        formattedYear
        year
        events(orderBy: sequence_asc, filter: {placeOccurred_some: {slug: $lookupName}}) {
          title
          sequence
          eventGroup{
            title
          }
          verses(orderBy: verseId_asc) {
            verseId
            osisRef
            title
          }
          participants(orderBy: name_asc) {
            name
            slug
          }
        }
      }
    }
  }
}
`