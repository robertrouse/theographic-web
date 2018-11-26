import React from 'react'

import { StaticQuery, Link, graphql } from 'gatsby';
import Img from 'gatsby-image';
import Layout from '../components/layout.js';
import '../components/layout.css'


class PlacesPage extends React.Component {
  
  render() {
    const {data} = this.props
  return(
  <Layout>
    <div className="container-2 w-container">
    
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
