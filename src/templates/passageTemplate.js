import React from 'react'
import { graphql, Link } from 'gatsby'
import { Helmet } from 'react-helmet'
import Markdown from 'react-markdown'
import '../components/layout.css'

class Passage extends React.Component {
  render() {
    const { data } = this.props
    return (
      <>
        <Helmet>
          <meta charSet="utf-8" />
          <title>{data.neo4j.Book[0].title}</title>
          <meta content="{data.neo4j.Book[0].title}" property="og:title" />
          <meta content="width=device-width, initial-scale=1" name="viewport" />
        </Helmet>
        <div className="container">
          <h1 className="sticky-title">{data.neo4j.Book[0].title}</h1>

          {data.neo4j.Book[0].chapters.map(chapter=>(
            <>
            <div className="sticky-sub" >
              <h3 id={chapter.osisRef}>Chapter {chapter.chapterNum}</h3>
            </div>
            
            {chapter.paragraphs.map(para => (
              <p>
                {para.verses.map(verse => (
                  <>
                  {" "}<span className="verse-num" id={verse.osisRef}>{verse.verseNum}</span>
                  <Markdown source={verse.mdText} />
                  </>
                ))}
              </p>
            ))}
            </>
          ))}
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
        osisRef
        paragraphs(orderBy: id_asc, filter:{introFlag:false}) {
          id
          verses(orderBy: verseNum_asc) {
            verseNum
            mdText
            osisRef
          }
        }
      }
    }
  }
}

`