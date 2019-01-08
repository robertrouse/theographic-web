import React from 'react'
import { graphql } from 'gatsby'
import { Helmet } from 'react-helmet'
import '../components/layout.css'

class Passage extends React.Component {

  render () {
    const {data} = this.props
    return (
      <>
        <Helmet>
          <meta charSet="utf-8"/>
          <title>{data.airtable.data.bookName}</title>
          <meta content="{data.airtable.data.bookName}" property="og:title"/>
          <meta content="width=device-width, initial-scale=1" name="viewport"/>
        </Helmet>
        <div className="container">
          <h1 className="heading">{data.airtable.data.bookName}</h1>
          <div className="footer"/>
        </div>
      </>
    )
  }
}

export default Passage

export const pageQuery = graphql`
   query passageLookup($lookup: String!) {
    airtable(table: {eq: "books"}, data: {bookName: {eq: $lookup }}) {
      data {
        bookName
      }
    }
  }
`

