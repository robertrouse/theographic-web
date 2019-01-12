import React from 'react'
import { graphql, Link } from 'gatsby'
import { Helmet } from 'react-helmet'
import '../components/layout.css'


function Verse(props) {
  const verse = props.verseData.data;
  const verseText = verse.verseText;
  const words = verseText.split(" ").map((word,i)=> <Link key={i} to={`/${word}`}>{word}&nbsp;</Link>);

  return <div key={verse.verseNum} id={verse.osisRef}>{verse.verseNum}&nbsp;{words}</div>
}

function Verses(props) {
  const verses = props.verses;
  return Object.keys(verses).map((verse,i) => <Verse key={i} verseData={verses[verse]} />)
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
          <h1 className="heading">{data.airtable.data.book[0].data.bookName}&nbsp;{data.airtable.data.chapterNum}</h1>
          <Verses verses={data.airtable.data.verses}></Verses>
          <div className="footer" />
        </div>
      </>
    )
  }
}

export default Passage

export const pageQuery = graphql`
query passage($lookup: String!) {
  airtable(table: {eq: "chapters"}, data: {chapterLookup: {eq: $lookup}}) {
    data {
      chapterNum
      book{
        data{
          bookName
        }
      }
      verses {
        data {
          verseNum
          verseText
          people {
            data {
              Aliases
              slug
            }
          }
          places {
            data {
              aliases
              slug
            }
          }
        }
      }
    }
  }
}
`