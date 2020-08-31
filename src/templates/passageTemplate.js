import React from 'react'
import { graphql } from 'gatsby'
import { Helmet } from 'react-helmet'
import Markdown from 'react-markdown'
import Layout from '../components/layout.js'

class Passage extends React.Component {
  render() {
    const { data } = this.props
    return (
      <Layout>
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
                <h3 id={chapter.osisRef} className='chapter-title'>Chapter {chapter.chapterNum}</h3>
              </div>
              <ol className='verse' >
                {chapter.verses.map(verse => (
                  <>
                  <li id={verse.osisRef}>
                    <Markdown 
                      source={verse.mdText} 
                      disallowedTypes={['paragraph']}
                      unwrapDisallowed={true}
                    />
                  </li>
                  </>
                ))}
              </ol>
            </>
          ))}
          <div className="footer" />
        </div>
      </Layout>
    )
  }
}

export default Passage

export const pageQuery = graphql`
query($lookupName: String!) {
  neo4j{
    Book(orderBy: bookOrder_asc, filter: { slug: $lookupName }) {
      title
      bookOrder
      chapters(orderBy: chapterNum_asc) {
        title
        chapterNum
        osisRef
        verses(orderBy: verseId_asc) {
          verseId
          verseNum
          mdText
          osisRef
        }
      }
    }
  }
}
`
