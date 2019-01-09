import React from 'react'
import { graphql } from 'gatsby'
import { Helmet } from 'react-helmet'
import '../components/layout.css'

function Verse(props) {
  const verse = props.verseData.data;
  //here we'll handle logic to insert links
  return <span key={verse.verseNum} id={verse.osisRef}>{verse.verseNum}&nbsp;{verse.verseText}&nbsp;</span>
}

function Verses(props) {
  const chapters = props.chapterData.data;
  const verses = chapters.verses.map((verse) => <Verse verseData={verse} />)
  
  return (
    <div>
      <h3>Chapter {chapters.chapterNum}</h3>
      <div>{verses}</div>
    </div>
  )
}

function Chapters(props) {
  const chapters = props.chapters;
  // console.log(props);
  return Object.keys(chapters).map((chapter) => <Verses chapterData={chapters[chapter]} />)
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

