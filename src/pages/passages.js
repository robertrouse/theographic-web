import React from 'react'
import { Link, graphql } from 'gatsby';
import Layout from '../components/layout.js';
import '../components/layout.css'

function Books(props) {
  const bookData = props.bookData.edges;
  const bookList = bookData.map((book) => 
    <Link to={`/${book.node.data.slug}`}>{book.node.data.bookName}</Link>
    // <Book bookData={book} />
  );

  return (
    <div>
      <h3>{bookData[0].node.data.testament}</h3>
      <div className="index-group">{bookList}</div>
    </div>
  )
}

function Testaments(props) {
  const testaments = props.testaments.group;
  testaments.sort((a, b) => b.edges[0].node.data.testament.localeCompare(a.edges[0].node.data.testament));
  return  Object.keys(testaments).map((testament) => <Books bookData={testaments[testament]}/>)
}

class Passages extends React.Component {
  
  render() {
    const {data} = this.props
  return(
  <Layout>
    <div className="container">
      <h1>Books of the Bible</h1>
      <Testaments testaments={data.allAirtable}/>
    </div>
    <div className="footer"></div>
  </Layout>)
  }
}

export default Passages

export const query = graphql
  `
  {
    allAirtable(filter: {table: {eq: "books"}}, sort: {fields: [data___bookOrder], order: ASC}) {
      group(field: data___testament) {
        edges {
          node {
            data {
              bookName
              slug
              testament
              chapters {
                data {
                  chapterNum
                  slug
                }
              }
            }
          }
        }
      }
    }
  }
  `