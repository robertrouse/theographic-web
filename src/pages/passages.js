import React from 'react'
import { Link, graphql } from 'gatsby';
import Layout from '../components/layout.js';
import '../components/layout.css';

function Books(props) {
  const bookData = props.bookData.books;
  const bookList = bookData.map((book,i) => 
    <Link to={`/${book.slug}`} key={i}>{book.title}</Link>
  );

  return (
    <div>
      <h3>{props.bookData.title}</h3>
      <div className="index-group">{bookList}</div>
    </div>
  )
}

function Testaments(props) {
  const testaments = props.testaments;
  return  Object.keys(testaments).map((testament,i) => <Books bookData={testaments[testament]} key={i}/>)
}

class Passages extends React.Component {
  
  render() {
    const {data} = this.props
  return(
  <Layout>
    <div className="container">
      <h1>Books of the Bible</h1>
      <Testaments testaments={data.neo4j.Testament}/>
    </div>
    <div className="footer"></div>
  </Layout>)
  }
}

export default Passages

export const query = graphql `
  {
    neo4j {
      Testament (orderBy:title_desc){
        title
        books (orderBy:bookOrder_asc){
          title
          slug
          bookOrder
        }
      }
    }
  }
  `