import React from 'react'
import { graphql, Link } from 'gatsby'
import { Helmet } from 'react-helmet'
import '../components/layout.css'
import VerseList from '../components/VerseList'

function Event(props) {
  const event = props.eventData.node.data;
  const people = (event.participants == null) ? false : 
    (event.participants.map((person, i) =>
      <>
        {i > 0 && ', '}
        <Link key={i} to={`/person/${person.data.slug}`}>{person.data.displayTitle}</Link>
      </>
    )
  );
  const places = (event.placeOccurred == null) ? false :
    (event.placeOccurred.map((place, i) =>
    <>
      {i > 0 && ', '}
      <Link key={i} to={`/place/${place.data.slug}`}>{place.data.displayTitle}</Link>
    </>
    )
  );

  return (
    <>
      <div><b>{event.eventName}</b></div>
      {people && (<div>People: {people}</div>)}
      {places && (<div>Places: {places}</div>)}
      <div>Passages: <VerseList verses={event.versesDescribed} /></div>
    </>
  )
}

function Events(props) {
  const events = props.eventData;
  const eventList  = events.edges.map((event, i) => <Event key={i} eventData={event} />);

  return (
    <>
      <div>
        <h3>{events.edges[0].node.data.yearGroup}</h3>
        <div>{eventList}</div>
      </div>
    </>
  )
}

function Years(props) {
  const years = props.periodData.group;
  return Object.keys(years).map((year, i) => <Events key={i} eventData={years[year]} />)
}

class Period extends React.Component {

  render() {
    const { data } = this.props
    return (
      <>
        <Helmet>
          <meta charSet="utf-8" />
          <title>{data.allAirtable.group[0].edges[0].node.data.eventGroup}</title>
          <meta content="{data.allAirtable.group[0].edges[0].node.data.eventGroup}" property="og:title" />
          <meta content="width=device-width, initial-scale=1" name="viewport" />
        </Helmet>
        <div className="container">
          <h1 className="heading">{data.allAirtable.group[0].edges[0].node.data.eventGroup}</h1>
          <Years periodData={data.allAirtable}></Years>
          <div className="footer" />
        </div>
      </>
    )
  }
}

export default Period

export const pageQuery = graphql
`
query period($lookup: String!) {
  allAirtable(filter: {table: {eq: "events"}, data: {eventGroup: {eq: $lookup}}}, sort: {fields: [data___sequence], order: ASC}) {
    group(field: data___yearGroup) {
      edges {
        node {
          data {
            eventName
            eventGroup
            sequence
            slug
            yearGroup
            participants {
              data {
                displayTitle
                slug
              }
            }
            placeOccurred {
              data {
                displayTitle
                slug
              }
            }
            versesDescribed {
              data {
                verseNum
                osisRef
                book {
                  data {
                    bookOrder
                    osisName
                  }
                }
                chapter {
                  data {
                    chapterNum
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`