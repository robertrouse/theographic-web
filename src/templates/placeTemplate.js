import React from 'react'
import { graphql } from 'gatsby'
import { Helmet } from 'react-helmet'
import './theographic.webflow.css'

// Taken from https://stackoverflow.com/questions/14446511/most-efficient-method-to-groupby-on-a-array-of-objects?rq=1
const groupBy = function (xs, key) {
  return xs.reduce(function (rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x)
    return rv
  }, {})
}

function DateGrouping (props) {
  const eventGroup = props.eventGroup
  const year = props.year

  const listItems = eventGroup.map((event) => <li key={event.data.Event_Name}><a href={`/event/${event.data.Event_Name}`}>{event.data.Event_Name}</a></li>)
  return (
    <div>
      <div className="year-label">{year} A.D.</div>
      <ol>{listItems}</ol>
    </div>
  )
}

//TODO deal with B.C. times as negative
function EventList (props) {
  const events = props.events || []
  const listItems = events.map(event => { return {year: event.data.Start_Year[0].data.Year, ...event}})
    .sort((event1, event2) => Number.parseInt(event1.year) - Number.parseInt(event2.year))
  const grouped = groupBy(listItems, `year`)
  return Object.keys(grouped).map((year) => <DateGrouping key={year} year={year} eventGroup={grouped[year]}/>)
}

function PeopleList (props) {
  const people = props.people || []
  // Taken from https://stackoverflow.com/questions/23618744/rendering-comma-separated-list-of-links
  return people.map((person, i) => <React.Fragment key={i}>
    {i > 0 && ', '}
    <a href={`/person/${person.data.Person_Lookup}/`}>{person.data.Name}</a>
  </React.Fragment>)
}

function BookList (props) {
  const verses = props.verses.map(v => {
    return {
      book: v.data.Book[0].data.Osis_Name,
      Osis_Ref: v.data.Osis_Ref,
      bookCannonicalOrder: v.data.Book[0].data.Canonical_Order,
      chapter: v.data.Chapter[0].data.Chapter_Lookup.split('.')[1],
      verse: v.data.Verse_Num
    }
  })
  const groupedBooks = groupBy(verses, 'book')
  const sortedGroup = Object.keys(groupedBooks).sort((book1, book2) => book1.bookCannonicalOrder - book2.bookCannonicalOrder)
  return sortedGroup.map(book => {
    return <div key={book}>{book}<VerseList verses={groupedBooks[book]}/></div>
  })
}

function VerseList (props) {
  const listOfVerses = []
  let firstOfAdjacentVerses = null
  let numberOfAdjacentVerses = 0
  let firstVerse = true
  for (let verse of props.verses) {
    if (!firstOfAdjacentVerses) {
      firstOfAdjacentVerses = verse
      continue
    }
    if (verse.chapter === firstOfAdjacentVerses.chapter && Number.parseInt(firstOfAdjacentVerses.verse) + numberOfAdjacentVerses + 1 === Number.parseInt(verse.verse)) {
      numberOfAdjacentVerses++
    } else {
      const key = `${firstVerse ? ' ' : ', '}${firstOfAdjacentVerses.chapter}:${firstOfAdjacentVerses.verse}`
      if (numberOfAdjacentVerses) {
        listOfVerses.push(<a key={key}
                             href={`/verse/${firstOfAdjacentVerses.Osis_Ref}`}>{`${firstVerse ? ' ' : ', '}${verse.chapter}:${firstOfAdjacentVerses.verse}-${Number.parseInt(firstOfAdjacentVerses.verse) + numberOfAdjacentVerses}`}</a>)
        numberOfAdjacentVerses = 0
      }
      else {
        listOfVerses.push(<a key={key} href={`/verse/${firstOfAdjacentVerses.Osis_Ref}`}>{key}</a>)
      }
      firstOfAdjacentVerses = verse
      firstVerse = false
    }
  }
  const key = `${firstVerse ? ' ' : ', '}${firstOfAdjacentVerses.chapter}:${firstOfAdjacentVerses.verse}`
  if (numberOfAdjacentVerses) {
    listOfVerses.push(<a key={key}
                         href={`/verse/${firstOfAdjacentVerses.Osis_Ref}`}>{`${firstVerse ? ' ' : ', '}${firstOfAdjacentVerses.chapter}:${firstOfAdjacentVerses.verse}-${Number.parseInt(firstOfAdjacentVerses.verse) + numberOfAdjacentVerses}`}</a>)
  }
  else {
    listOfVerses.push(<a key={key} href={`/verse/${firstOfAdjacentVerses.Osis_Ref}`}>{key}</a>)
  }
  return listOfVerses
}

class Place extends React.Component {

  render () {
    const {data} = this.props
    console.log(JSON.stringify(data.airtable))
    return (
      <>
        <Helmet>
          <meta charSet="utf-8"/>
          <title>Places</title>
          <meta content="Places" property="og:title"/>
          <meta content="width=device-width, initial-scale=1" name="viewport"/>
          <meta content="Webflow" name="generator"/>
          <link href="https://daks2k3a4ib2z.cloudfront.net/img/favicon.ico" rel="shortcut icon" type="image/x-icon"/>
          <link href="https://daks2k3a4ib2z.cloudfront.net/img/webclip.png" rel="apple-touch-icon"/>
        </Helmet>
        <div className="container">
          <h1 className="heading">{data.airtable.data.KJV_Name}</h1>
          <img src={`/images/${data.airtable.data.Place_Lookup}-wide.png`} sizes="(max-width: 767px) 100vw, 750px" alt=""
               className="map"/>
          <img src={`/images/${data.airtable.data.Place_Lookup}-detail.png`} sizes="(max-width: 767px) 100vw, 750px" alt=""
               className="map"/>
          <p className="container" dangerouslySetInnerHTML={{__html: data.airtable.data.Dictionary_text}}/>
          <div className="text-block">M.G. Easton M.A., D.D., Illustrated Bible Dictionary, Third Edition</div>
          <h3 className="heading-3">Related People</h3>
          <p><PeopleList people={data.airtable.data.Has_been_here}/></p>
          <h3>Related Events</h3>
          <EventList events={data.airtable.data.Events_here}/>
          <h3>Verses</h3>
          <BookList verses={data.airtable.data.Verses}/>

          <div className="footer"/>
          <script src="https://code.jquery.com/jquery-3.3.1.min.js" type="text/javascript" integrity="sha256-FgpCb/KJQlLNfOu91ta32o/NMZxltwRo8QtmkMRdAu8=" crossOrigin="anonymous"/>
          <script src="js/webflow.js" type="text/javascript"/>
        </div>
      </>
    )
  }
}

export default Place

export const pageQuery = graphql`
   query PlaceLookup($lookup: String!) {
    airtable(table: {eq: "Places"}, data: {Place_Lookup: {eq: $lookup }}) {
      data {
        Place_Lookup
        Dictionary_text
        Place_ID
        KJV_Name
        Has_been_here{
          data{
            Person_Lookup
            Name
          }
        }
        Events_here{
          data{
            Event_Name
            Start_Year{
              data {
                Year
              }
            }
          }
        }
        Verses{
          data{
            Verse_Num
            Book{
              data{
                Canonical_Order
                Osis_Name
              }
            }
            Chapter{
              data{
                Chapter_Lookup
              }
            }
          }
        }
      }
    }
  }
`
