import React from 'react'
import { graphql, Link } from 'gatsby'
import { Helmet } from 'react-helmet'
import '../components/layout.css'


function Verse(props) {
  const verse = props.verseData.data;
  const words = verse.verseText.split(" ").map((word, i) =>
  //placeholder to handle tagging logic
  {
    if (i % 5 == 1) {
      return( <Link key={i} to="#">{word} </Link>)
    } else {
      return (<>{word} </>)
    }
  }
  );
  words.join();

  return <div key={verse.verseNum} id={verse.osisRef}>{verse.verseNum} {words}</div>
  // return <div key={verse.verseNum} id={verse.osisRef}>{verse.verseNum}&nbsp;{verse.verseText}&nbsp;</div>
}

function Verses(props) {
  const chapters = props.chapterData.data;
  const verses = chapters.verses.map((verse, i) => <Verse key={i} verseData={verse} />)
  return (
    <>
      <div>
        <h3>Chapter {chapters.chapterNum}</h3>
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
          <title>{data.airtable.data.bookName}</title>
          <meta content="{data.airtable.data.bookName}" property="og:title" />
          <meta content="width=device-width, initial-scale=1" name="viewport" />
        </Helmet>
        <div className="container">
          <h1 className="heading">{data.airtable.data.bookName}</h1>
          <Chapters chapters={data.airtable.data.chapters}></Chapters>
          <div className="footer" />
        </div>
      </>
    )
  }
}

export default Passage

export const pageQuery = graphql`
query passage($lookup: String!) {
  airtable(table: {eq: "books"}, data: {bookName: {eq: $lookup}}) {
    data {
      bookName
      chapters {
        data {
          chapterNum
          verses {
            data {
              verseNum
              verseText
              people{
                data{
                  Aliases
                  slug
                }
              }
              places{
                data{
                  aliases
                  slug
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