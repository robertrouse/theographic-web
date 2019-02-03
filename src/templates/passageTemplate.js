import React from 'react'
import { graphql, Link } from 'gatsby'
import { Helmet } from 'react-helmet'
import '../components/layout.css'


function Verse(props) {
  const verse = props.verseData;
  const words = verse.verseText.split(" ").map((word, i) =>
    {
      var person = '';
      var place = '';

      if (verse.people.length > 0) {
        person = verse.people.filter(names => 
          names.name.indexOf(word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"")) > -1
        );
      }
      if (verse.places.length > 0) {
        place = verse.places.filter(names => 
          names.name.indexOf(word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"")) > -1
        );
      }
      console.log(person.length)

      if (person.length > 0) {
        return( <Link key={i} to={`/person/${person[0].slug}`}>{word} </Link> )
      } else if (place.length > 0) {
        return( <Link key={i} to={`/place/${place[0].slug}`}>{word} </Link> )
      } else {
        return (<>{word} </>)
      }
    }
  );
  words.join();

  return <div key={props.key} id={verse.osisRef}>{verse.verseNum} {words}</div>
}

function Verses(props) {
  const chapter = props.chapterData;
  const verses = chapter.verses.map((verse, i) => <Verse key={i} verseData={verse} />)
  return (
    <>
      <div>
        <h3 id={chapter.chapterNum}>{chapter.title}</h3>
        <div>{verses}</div>
      </div>
    </>
  )
}

function Chapters(props) {
  const chapters = props.chapters;
  return Object.keys(chapters).map((chapter, i) => <Verses key={i} chapterData={chapters[chapter]} />)
}

class Passage extends React.Component {

  render() {
    const { data } = this.props
    return (
      <>
        <Helmet>
          <meta charSet="utf-8" />
          <title>{data.neo4j.Book.title}</title>
          <meta content="{data.neo4j.Book.title}" property="og:title" />
          <meta content="width=device-width, initial-scale=1" name="viewport" />
        </Helmet>
        <div className="container">
          <h1 className="heading">{data.neo4j.Book[0].title}</h1>
          <Chapters chapters={data.neo4j.Book[0].chapters}></Chapters>
          <div className="footer" />
        </div>
      </>
    )
  }
}

export default Passage

export const pageQuery = graphql`
query ($lookupName: String!) {
  neo4j {
    Book(orderBy: bookOrder_asc, filter: {slug: $lookupName}) {
      title
      bookOrder
      chapters(orderBy: chapterNum_asc) {
        title
        chapterNum
        verses(orderBy: verseNum_asc) {
          verseNum
          verseText
          osisRef
          people {
            name
            title
            slug
          }
          places {
            name
            slug
          }
        }
      }
    }
  }
}
`