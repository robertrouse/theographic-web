import React from 'react'
import { graphql } from 'gatsby'
import { Helmet } from 'react-helmet'
import Img from 'gatsby-image';
import '../components/layout.css'

// function DateGrouping (props) {
//   const eventGroup = props.eventGroup
//   const year = props.year
//   const listItems = eventGroup.map((event) => <li key={event.data.eventName}><a href={`/event/${event.data.eventName}`}>{event.data.eventName}</a></li>)
//   return (
//     <div>
//       <div className="year-label">{year} A.D.</div>
//       <ol>{listItems}</ol>
//     </div>
//   )
// }

//TODO deal with B.C. times as negative
// function EventList (props) {
//   const events = props.events || []
//   const listItems = events.map(event => { return {year: event.data.startYear[0].data.year, ...event}})
//     .sort((event1, event2) => Number.parseInt(event1.year) - Number.parseInt(event2.year))
//   const grouped = groupBy(listItems, `year`)
//   return Object.keys(grouped).map((year) => <DateGrouping key={year} year={year} eventGroup={grouped[year]}/>)
// }

function PeopleList (props) {
  const people = props.people || []
  // Taken from https://stackoverflow.com/questions/23618744/rendering-comma-separated-list-of-links
  return people.map((person, i) => <React.Fragment key={i}>
    {i > 0 && ', '}
    <a href={`/person/${person.slug}/`}>{person.name}</a>
  </React.Fragment>)
}

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
          <h3>Timeline</h3>

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
  }
}
`