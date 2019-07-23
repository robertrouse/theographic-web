import React from 'react'
import { graphql } from 'gatsby'
import { Helmet } from 'react-helmet'
import Img from 'gatsby-image'
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
          <h1 className="sticky-title">{data.neo4j.Place[0].name}</h1>
          {data.wideMap && (<Img fluid={data.wideMap.childImageSharp.fluid} className="map"/>)}
          <p className="container">{data.neo4j.Place[0].description}</p>
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
    timeline: Event(orderBy:sortKey_asc, filter: {placeOccurred_some: {slug: $lookupName}}) {
      title
      sequence
      sortKey
      year: yearsOccurred(orderBy: year_asc, first: 1) {
        formattedYear
      }
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
`