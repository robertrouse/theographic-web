import React from 'react'
import { graphql, Link } from 'gatsby'
import { Helmet } from 'react-helmet'
import '../components/layout.css'
import VerseList from '../components/VerseList'

// function Event(props) {
//   const event = props.eventData.node.data;
//   const people = (event.participants == null) ? false : 
//     (event.participants.map((person, i) =>
//       <>
//         {i > 0 && ', '}
//         <Link key={i} to={`/person/${person.data.slug}`}>{person.data.displayTitle}</Link>
//       </>
//     )
//   );
//   const places = (event.placeOccurred == null) ? false :
//     (event.placeOccurred.map((place, i) =>
//     <>
//       {i > 0 && ', '}
//       <Link key={i} to={`/place/${place.data.slug}`}>{place.data.displayTitle}</Link>
//     </>
//     )
//   );

//   return (
//     <>
//       <div><b>{event.eventName}</b></div>
//       {people && (<div>People: {people}</div>)}
//       {places && (<div>Places: {places}</div>)}
//       <div>Passages: <VerseList verses={event.versesDescribed} /></div>
//     </>
//   )
// }

class Period extends React.Component {

  render() {
    const { data } = this.props
    return (
      <>
        <Helmet>
          <meta charSet="utf-8" />
          <title>{data.neo4j.EventGroup[0].title}</title>
          <meta content="{data.neo4j.EventGroup[0].title}" property="og:title" />
          <meta content="width=device-width, initial-scale=1" name="viewport" />
        </Helmet>
        <div className="container">
          <h1 className="heading">{data.neo4j.EventGroup[0].title}</h1>
          {data.neo4j.EventGroup[0].years.map(year => (
            <>
            <div className="year-label">{year.formattedYear}</div>
            <div></div>
            </>
          ))}
          
          <div className="footer" />
        </div>
      </>
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
        events(orderBy: sequence_asc) {
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