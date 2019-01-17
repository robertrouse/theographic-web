import React from 'react'
import { Link, graphql } from 'gatsby';
import Layout from '../components/layout.js';
import '../components/layout.css'

function LinkList(props) {
  const letterData = props.letterData.edges;
  const alphaGroup = letterData[0].node.data.alphaGroup;
  const letterList = letterData.map((letter, i) => {
    if (letter.node.data.status === 'wip') {
      return <span className="index-item">{letter.node.data.displayTitle}</span>
    } else {
      return <Link key={i} to={`/place/${letter.node.data.placeLookup}`} className="index-item">{letter.node.data.displayTitle}</Link>
    }
  }
  );
  return (
    <div>
      <h3 id={alphaGroup}>{alphaGroup}</h3>
      <div className="index-group">{letterList}</div>
    </div>
  )
}

function AlphaList(props) {
  const letters = props.letters.group;
  return Object.keys(letters).map((letter, i) => <LinkList key={i} letterData={letters[letter]} />)
}

class PlacesPage extends React.Component {

  render() {
    const { data } = this.props
    return (
      <Layout>
        <div className="container">
          <h1>All Places in the Bible</h1>
          <AlphaList letters={data.allAirtable} />
        </div>
        <div className="footer"></div>
      </Layout>)
  }
}

export default PlacesPage

export const query = graphql
  `
  {
    allAirtable(filter: { table: { eq: "places" }} ) {
      group(field:data___alphaGroup){
        edges {
          node {
            data {
              placeLookup
              displayTitle
              status
              alphaGroup
            }
          } 
        }
      }
    }
  }
  `