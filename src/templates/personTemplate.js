import React from 'react'
import { graphql, Link } from 'gatsby'
import Markdown from 'react-markdown'
import { Helmet } from 'react-helmet'
import Layout from '../components/layout.js'
import EventList from '../components/EventList'
  
class Person extends React.Component {

  render () {
    const {data} = this.props
    const person = data.neo4j.Person[0]
    return (
      <Layout>
        <Helmet>
          <meta charSet="utf-8"/>
          <title>{person.name}</title>
          <meta content="{person.name}" property="og:title"/>
          <meta content="width=device-width, initial-scale=1" name="viewport"/>
        </Helmet>
        <div className="container">
          <h1 className="sticky-title">{person.name}</h1>
          {person.alsoCalled && (
            <div>{person.alsoCalled.map((alias, i) => <>{i > 0 && ', '}{alias}</>)}</div>
          )}
          {person.description && (
            <>
            <Markdown source={person.description} />
            <div className="citation">M.G. Easton M.A., D.D., Illustrated Bible Dictionary, Third Edition</div>
            <div className="div-block"/>
            </>
          )}
          {person.childOf.length > 0 && (
            <>
            <div>
              <b>Parents: </b>
              <Link to={'/person/' + person.childOf[0].slug}>{person.childOf[0].name}</Link>
              {person.childOf[1] && (<>, <Link to={'/person/' + person.childOf[1].slug}>{person.childOf[1].name}</Link></>)}
            </div>
            </>
          )}
          {person.partnerOf.length > 0 && (
            <>
            <div>
              <b>Partners: </b>
              {person.partnerOf.map((partner, i) =>
                        <>
                          {i > 0 && ', '}
                          <Link key={i} to={'/person/' + partner.slug}>{partner.name}</Link>
                        </>
                      )
              }
            </div>
            </>
          )}
          {person.parentOf.length > 0 && (
            <>
            <b>Children: </b>
            {person.parentOf.map((child, i) =>
                      <>
                        {i > 0 && ', '}
                        <Link key={i} to={'/person/' + child.slug}>{child.name}</Link>
                      </>
                    )
            }
            </>
          )}
          {person.memberOf.length > 0 && (
            <div>
            <b>Member of: </b>
            {person.memberOf.map((group, i) => <>{i > 0 && ', '}{group.name}</>)}
            </div>
          )}
          {(person.birthYear.length > 0 || person.birthPlace.length > 0) && (
            <>
            <div>
              <b>Born: </b>
              {person.birthPlace.length > 0 && (<Link to={'/place/' + person.birthPlace[0].slug}>{person.birthPlace[0].name}</Link>)}
              {person.birthYear.length > 0 && (<>{' ' + person.birthYear[0].formattedYear}</>)}
            </div>
            </>
          )}
          {(person.deathYear.length > 0 || person.deathPlace.length > 0) && (
            <>
            <div>
              <b>Died: </b>
              {person.deathPlace.length > 0 && (<Link to={'/place/' + person.deathPlace[0].slug}>{person.deathPlace[0].name}</Link>)}
              {person.deathYear.length > 0 && (<>{' ' + person.deathYear[0].formattedYear}</>)}
            </div>
            </>
          )}
          {person.writerOf.length > 0 && (
            <>
            <b>Wrote (or contributed to): </b>
            {person.writerOf.map((book, i) =>
                      <>
                        {i > 0 && ', '}
                        <Link key={i} to={book.slug}>{book.title}</Link>
                      </>
                    )
            }
            </>
          )}

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
      </Layout>
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
      alsoCalled
      description
      gender
      birthYear{
        formattedYear
      }
      birthPlace{
        name
        slug
      }
      deathYear{
        formattedYear
      }
      deathPlace{
        name
        slug
      }
      parentOf {
        name
        slug
      }
      childOf {
        name
        gender
        slug
      }
      partnerOf {
        name
        slug
      }
      memberOf{
        name
      }
      writerOf(orderBy:bookOrder_asc){
        bookOrder
        title
        slug
        writers{
          name
          slug
        }
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
