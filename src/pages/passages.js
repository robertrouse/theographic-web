import React from 'react'
import { Link, graphql } from 'gatsby';
import Layout from '../components/layout.js';
import '../components/layout.css'

function LinkList(props) {
  const bookData = props.bookData.edges;
  const bookList = bookData.map((book) => {
      return <Link to={`/${book.node.data.slug}`} className="index-item">{book.node.data.bookName}</Link>
  }
  );
  return (
    <div>
      <h3>{bookData[0].node.data.testament}</h3>
      <div className="index-group">{bookList}</div>
    </div>
  )
}

function BookList(props) {
  const groups = props.books.group;
  const sorted = groups.sort();
  const testaments = sorted.reverse();
  return  Object.keys(testaments).map((testament) => <LinkList bookData={testaments[testament]}/>)
}

class Passages extends React.Component {
  
  render() {
    const {data} = this.props
  return(
  <Layout>
    <div className="container">
      <h1>Books of the Bible</h1>
      <BookList books={data.allAirtable}/>
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
            }
          }
        }
      }
    }
  }
  `