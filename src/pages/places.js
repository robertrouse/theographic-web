import React from 'react'

import { StaticQuery, Link, graphql } from 'gatsby';
import Img from 'gatsby-image';
import Layout from '../components/layout.js';
import '../components/layout.css'

function LinkList(props) {
  const letterData = props.letterData.edges;
  console.log(letterData);
  const alphaGroup = letterData[0].node.data.alpha_group;
  const letterList = letterData.map((letter) => {
    if (letter.node.data.status === 'wip') {
      return <span className="index-item">{letter.node.data.Display_Title}</span>
    } else {
      return <a href = {`/place/${letter.node.data.Place_Lookup}`} className="index-item">{letter.node.data.Display_Title}</a>
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

class PlacesPage extends React.Component {
  
  render() {
    const {data} = this.props
  return(
  <Layout>
    <div className="container">
      <h1>All Places in the Bible</h1>
      <AlphaList letters={data.allAirtable}/>
    </div>
    <div className="footer"></div>
  </Layout>)
  }
}

export default PlacesPage

export const query = graphql
  `
  {
    allAirtable(filter: { table: { eq: "Places" }} ) {
      group(field:data___alpha_group){
        edges {
        	node {
            data {
              Place_Lookup
              Display_Title
              status
            	alpha_group
          	}
          } 
        }
      }
    }
  }
  `
