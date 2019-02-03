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
    <a href={`/person/${person.slug}/`}>{person.title}</a>
  </React.Fragment>)
}

// function BookList (props) {
//   if(!props.verses) return <div></div>
//   const verses = props.verses.map(v => {
//     return {
//       book: v.data.book[0].data.osisName,
//       osisRef: v.data.osisRef,
//       bookCannonicalOrder: v.data.book[0].data.bookOrder,
//       chapter: v.data.chapter[0].data.chapterNum,
//       verse: v.data.verseNum
//     }
//   })
//   const groupedBooks = groupBy(verses, 'book')
//   const sortedGroup = Object.keys(groupedBooks).sort((book1, book2) => book1.bookCannonicalOrder - book2.bookCannonicalOrder)
//   return sortedGroup.map(book => {
//     return <div key={book}>{book}<VerseList verses={groupedBooks[book]}/></div>
//   })
// }

// function VerseList (props) {
//   const listOfVerses = []
//   let firstOfAdjacentVerses = null
//   let numberOfAdjacentVerses = 0
//   let firstVerse = true
//   for (let verse of props.verses) {
//     if (!firstOfAdjacentVerses) {
//       firstOfAdjacentVerses = verse
//       continue
//     }
//     if (verse.chapter === firstOfAdjacentVerses.chapter && Number.parseInt(firstOfAdjacentVerses.verse) + numberOfAdjacentVerses + 1 === Number.parseInt(verse.verse)) {
//       numberOfAdjacentVerses++
//     } else {
//       const key = `${firstVerse ? ' ' : ', '}${firstOfAdjacentVerses.chapter}:${firstOfAdjacentVerses.verse}`
//       if (numberOfAdjacentVerses) {
//         listOfVerses.push(<a key={key}
//                              href={`/verse/${firstOfAdjacentVerses.Osis_Ref}`}>{`${firstVerse ? ' ' : ', '}${verse.chapter}:${firstOfAdjacentVerses.verse}-${Number.parseInt(firstOfAdjacentVerses.verse) + numberOfAdjacentVerses}`}</a>)
//         numberOfAdjacentVerses = 0
//       }
//       else {
//         listOfVerses.push(<a key={key} href={`/verse/${firstOfAdjacentVerses.osisRef}`}>{key}</a>)
//       }
//       firstOfAdjacentVerses = verse
//       firstVerse = false
//     }
//   }
//   const key = `${firstVerse ? ' ' : ', '}${firstOfAdjacentVerses.chapter}:${firstOfAdjacentVerses.verse}`
//   if (numberOfAdjacentVerses) {
//     listOfVerses.push(<a key={key}
//                          href={`/verse/${firstOfAdjacentVerses.Osis_Ref}`}>{`${firstVerse ? ' ' : ', '}${firstOfAdjacentVerses.chapter}:${firstOfAdjacentVerses.verse}-${Number.parseInt(firstOfAdjacentVerses.verse) + numberOfAdjacentVerses}`}</a>)
//   }
//   else {
//     listOfVerses.push(<a key={key} href={`/verse/${firstOfAdjacentVerses.osisRef}`}>{key}</a>)
//   }
//   return listOfVerses
// }

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
          <div className="text-block">M.G. Easton M.A., D.D., Illustrated Bible Dictionary, Third Edition</div>
          <h3 className="heading-3">Related People</h3>
          <p><PeopleList people={data.neo4j.Place[0].hasBeenHere}/></p>
          <h3>Related Events</h3>
          {/* <EventList events={data.airtable.data.eventsHere}/> */}
          <h3>Verses</h3>
          {/* <BookList verses={data.airtable.data.verses}/> */}
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
        title
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