import React from 'react'
import { Link, graphql } from 'gatsby';
import Layout from '../components/layout.js';
import '../components/layout.css'

function LinkList(props) {
  const letterData = props.letterData.edges;
  const alphaGroup = letterData[0].node.data.alphaGroup;
  const letterList = letterData.map((letter) => {
    if (letter.node.data.status === 'wip') {
      return <span className="index-item">{letter.node.data.name}</span>
    } else {
      return <Link to = {`/person/${letter.node.data.personLookup}`} className="index-item">{letter.node.data.displayTitle}</Link>
    }
}
  );
  return (
    <div>
      <h3>{alphaGroup}</h3>
      <div className="index-group">{letterList}</div>
    </div>
  )
}

function AlphaList(props) {
  const letters = props.letters.group;
    return  Object.keys(letters).map((letter) => <LinkList letterData={letters[letter]} />)
}

class PeoplePage extends React.Component {
  
  render() {
    const {data} = this.props
  return(
  <Layout>
    <div className="container">
      <h1>All People in the Bible</h1>
      <AlphaList letters={data.allAirtable}/>
    </div>
    <div className="footer"></div>
  </Layout>)
  }
}

export default PeoplePage

export const query = graphql
  `
  {
    allAirtable(filter: { table: { eq: "people" }} ) {
      group(field:data___alphaGroup){
        edges {
        	node {
            data {
              personLookup
              displayTitle
              name
              status
            	alphaGroup
          	}
          } 
        }
      }
    }
  }
  `