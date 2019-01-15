import React from 'react'
import { graphql } from 'gatsby'
import { Helmet } from 'react-helmet'
import '../components/layout.css'

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

  const listItems = eventGroup.map((event) => <li key={event.data.eventName}><a href={`/event/${event.data.eventName}`}>{event.data.eventName}</a></li>)
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
  const listItems = events.map(event => { return {year: event.data.startYear[0].data.year, ...event}})
    .sort((event1, event2) => Number.parseInt(event1.year) - Number.parseInt(event2.year))
  const grouped = groupBy(listItems, `year`)
  return Object.keys(grouped).map((year) => <DateGrouping key={year} year={year} eventGroup={grouped[year]}/>)
}

function PeopleList (props) {
  const people = props.people || []
  // Taken from https://stackoverflow.com/questions/23618744/rendering-comma-separated-list-of-links
  return people.map((person, i) => <React.Fragment key={i}>
    {i > 0 && ', '}
    <a href={`/person/${person.data.personLookup}/`}>{person.data.displayTitle}</a>
  </React.Fragment>)
}

function PlaceList (props) {
  const places = props.places || []
  // Taken from https://stackoverflow.com/questions/23618744/rendering-comma-separated-list-of-links
  return places.map((place, i) => <React.Fragment key={i}>
    {i > 0 && ', '}
    <a href={`/place/${place.data.placeLookup}/`}>{place.data.displayTitle}</a>
  </React.Fragment>)
}

function BookList (props) {
  if(!props.verses) return <div></div>
  const verses = props.verses.map(v => {
    return {
      book: v.data.book[0].data.osisName,
      bookCannonicalOrder: v.data.book[0].data.bookOrder,
      chapter: v.data.chapter[0].data.chapterNum,
      verse: v.data.verseNum
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
                             href={`/verse/${firstOfAdjacentVerses.Osis_Ref}`}>
          {`${firstVerse ? ' ' : ', '}${verse.chapter}:${firstOfAdjacentVerses.verse}-${Number.parseInt(firstOfAdjacentVerses.verse) + numberOfAdjacentVerses}`}
        </a>)
        numberOfAdjacentVerses = 0
      }
      else {
        listOfVerses.push(<a key={key} href={`/verse/${firstOfAdjacentVerses.osisRef}`}>{key}</a>)
      }
      firstOfAdjacentVerses = verse
      firstVerse = false
    }
  }
  const key = `${firstVerse ? ' ' : ', '}${firstOfAdjacentVerses.chapter}:${firstOfAdjacentVerses.verse}`
  if (numberOfAdjacentVerses) {
    listOfVerses.push(<a key={key} href={`/verse/${firstOfAdjacentVerses.osisRef}`}>
      {`${firstVerse ? ' ' : ', '}${firstOfAdjacentVerses.chapter}:${firstOfAdjacentVerses.verse}-${Number.parseInt(firstOfAdjacentVerses.verse) + numberOfAdjacentVerses}`}
    </a>)
  }
  else {
    listOfVerses.push(<a key={key} href={`/verse/${firstOfAdjacentVerses.osisRef}`}>{key}</a>)
  }
  return listOfVerses
}

function ConditionalAliases(props){
  if(props.aliases){
    return <div className="container"><strong>Also called: </strong>{props.aliases}</div>
  }else{
    return <div></div>
  }
}

function ConditionalFather(props){
  if(props.father){
    return <div id="w-node-70773c1d322e-749a0e41"><strong>Father:</strong> <a href={`/person/${props.father[0].data.personLookup}/`}>{props.father[0].data.displayTitle}</a></div>
  }else{
    return <div></div>
  }
}

// TODO not finished done
function BookWrittenList (props) {
  const books = props.booksWritten || []
  // Taken from https://stackoverflow.com/questions/23618744/rendering-comma-separated-list-of-links
  return books.map((book, i) => <React.Fragment key={i}>
    {i > 0 && ', '}
    <a href={`/book/${book.data.osisName}/`}>{book.data.osisName}</a>
  </React.Fragment>)
}

function ConditionalBooksWritten(props){
  if(props.booksWritten){
    return <div><strong>Books written:</strong> <a href="/book/1">1 Peter</a>, <a href="/book/2">2 Peter</a></div>
  }else{
    return <div></div>
  }
}

function ConditionalGroups(props){
  if(props.groups){
    // TODO more than one group
    const groupName = props.groups[0].data.groupName;
    return   <div><strong>Member of:</strong> <a href={`/groups/${groupName}/`}>groupName</a></div>
  }else{
    return <div></div>
  }
}
  
class Person extends React.Component {

  render () {
    const {data} = this.props
    return (
      <>
        <Helmet>
          <meta charSet="utf-8"/>
          <title>People</title>
          <meta content="People" property="og:title"/>
          <meta content="width=device-width, initial-scale=1" name="viewport"/>
        </Helmet>
        <div className="container">
          <h1 className="heading">{data.airtable.data.displayTitle}</h1>

          <p className="container" dangerouslySetInnerHTML={{__html: data.airtable.data.dictionaryText}}/>
          <div className="text-block">M.G. Easton M.A., D.D., Illustrated Bible Dictionary, Third Edition</div>

          <div className="div-block"/>
          <ConditionalAliases aliases={data.airtable.data.aliases}/>
          <ConditionalFather father={data.airtable.data.father}/>

          <h3 className="heading-3">Related People</h3>
          <p><PeopleList people={data.airtable.data.personalNetwork}/></p>

          <h3>Related Events</h3>
          <EventList events={data.airtable.data.events}/>

          <h3 className="heading-3">Related Places</h3>
          <p><PlaceList places={data.airtable.data.hasBeenTo}/></p>

          <h3>Verses</h3>
          <BookList verses={data.airtable.data.verses}/>
          <div className="footer"/>
        </div>
      </>
    )
  }
}

export default Person

export const pageQuery = graphql`
query personLookup($lookup: String!) {
   airtable(table: {eq: "people"}, data: {personLookup: {eq: $lookup }}) {
      data {
        personLookup
        displayTitle
        dictionaryText
        aliases
        father{
          data{
            personLookup
            displayTitle
           }
        }   
        hasBeenTo{
          data{
            placeLookup
            displayTitle
          }
        }
        events{
          data{
            eventName
            startYear{
              data {
                year
              }
            }
          }
        }
        personalNetwork{
          data{
            personLookup
            displayTitle
          }
        }
        memberOf{
          data{
            groupName
           }
        }
        verses{
          data{
            verseNum
            book{
              data{
                bookOrder
                osisName
              }
            }
            chapter{
              data{
                chapterNum
              }
            }
          }
        }
      }
  }
}
`
