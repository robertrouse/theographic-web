import React from 'react'
import { Link, graphql } from 'gatsby';
import Layout from '../components/layout.js';
import '../components/layout.css'

function Book(props) {
  const book=props.bookData.node.data;
  console.log(book);
  const chapters = book.chapters.map((chapter) => 
    <Link to={`/${chapter.data.slug}`}>{chapter.data.chapterNum}</Link>
  );
  
  return (
    <>
    <h3>{book.bookName}</h3>
    <div className="index-book">{chapters}</div>
    </>
  )
}

function Books(props) {
  const bookData = props.bookData.edges;
  const bookList = bookData.map((book) => <Book bookData={book} />);

  return (
    <div>
      <h1>{bookData[0].node.data.testament}</h1>
      <div>{bookList}</div>
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